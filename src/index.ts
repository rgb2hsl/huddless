import { Router } from "@tsndr/cloudflare-worker-router";
import { ValidationError } from "yup";
import {
  PersonHandshake,
  PostBody,
  PostBodySchema,
  PostBodyUnsigned,
} from "./types/PostBody";
import { verify } from "./helpers/verify";
import { Person, PersonPartialSchema } from "./types/HubState";
import identity from "./helpers/identity";
import {
  MessagePayload,
  PersonsPayload,
  SystemMessagePayload,
} from "./types/Messages";

export interface Env {
  HUDDLESS: DurableObjectNamespace;
  HUDDLESS_NAME: string;
}

// Initialize router
const router = new Router();

// Enabling build in CORS support
router.cors({
  allowOrigin: "*",
});

/** =====================
 * ROUTES
 * ====================== */

/** Healthcheck */
router.get("/status/", ({ res }) => {
  res.body = {
    status: "ok",
  };
});

/** Check signature test */
router.post("/sigcheck/", async ({ req, res }) => {
  try {
    await PostBodySchema.validate(req.body);
    const postBody: PostBody = req.body as PostBody;
    const postBodyUnsigned: PostBodyUnsigned = {
      type: postBody.type,
      body: postBody.body,
      publicKey: postBody.publicKey,
    };

    const result = await verify(
      JSON.stringify(postBodyUnsigned),
      postBody.signature,
      postBody.publicKey
    );

    res.status = 200;
    res.body = {
      result,
    };
  } catch (e: ValidationError | unknown) {
    if ((e as ValidationError).name === "ValidationError") {
      const validationError = e as ValidationError;
      res.status = 400;
      res.body = validationError.errors;
    } else {
      res.status = 400;
      res.body = (e as Error)?.message;
    }
  }
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const huddless = env.HUDDLESS.get(
      env.HUDDLESS.idFromName(env.HUDDLESS_NAME)
    );

    switch (url.pathname) {
      case "/ws/":
        return await huddless.fetch(request);
      default:
        return await router.handle(env, request);
    }
  },
};

interface HuddlessSession {
  person: Person;
  ws: WebSocket;
}

export class Huddless implements DurableObject {
  state: DurableObjectState;
  env: Env;
  sessions: HuddlessSession[];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
  }

  async fetch(req: Request): Promise<Response> {
    const pair = new WebSocketPair();

    await this.handleSession(pair[1]);

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  broadcastPersons(
    persons: Person[],
    sessions: HuddlessSession[] = this.sessions
  ): void {
    sessions.forEach((session) => {
      const personPayload: PersonsPayload = {
        type: "PERSONS",
        body: persons,
      };

      session.ws.send(JSON.stringify(personPayload));
    });
  }

  broadcastSystemMessage(message: string): void {
    this.sessions.forEach((session) => {
      const joinMessagePayload: SystemMessagePayload = {
        type: "SYSTEM_MESSAGE",
        body: {
          date: new Date(),
          body: message,
        },
      };

      session.ws.send(JSON.stringify(joinMessagePayload));
    });
  }

  broadcastMessage(identityString: string, message: string): void {
    this.sessions.forEach((session) => {
      const messagePayload: MessagePayload = {
        type: "MESSAGE",
        body: {
          identity: identityString,
          date: new Date(),
          body: message,
        },
      };

      session.ws.send(JSON.stringify(messagePayload));
    });
  }

  async handleSession(webSocket: WebSocket): Promise<void> {
    webSocket.accept();

    // setting up a socket for client
    webSocket.addEventListener("message", async ({ data }) => {
      if (data instanceof ArrayBuffer) return;

      /** Signature validation start */

      let obj;

      try {
        obj = JSON.parse(data);
        await PostBodySchema.validate(obj);
      } catch {
        console.error("[WS message handler] invalid message", obj);
        return;
      }

      const postBody = obj as PostBody;
      const { signature, ...postBodyUnsigned } = postBody;

      const signVerified = await verify(
        JSON.stringify(postBodyUnsigned),
        signature,
        postBody.publicKey
      );

      if (!signVerified) {
        console.error("[WS message handler] invalid signature", obj);
        return;
      }

      /** Signature validation end */

      /** PostBody switch start */

      if (postBody.type === "MESSAGE") {
        // broadcast message to all sessions
        this.broadcastMessage(
          await identity(postBody.publicKey),
          postBody.body
        );
      } else if (postBody.type === "PERSON") {
        let personLike;

        try {
          personLike = JSON.parse(postBody.body);
          await PersonPartialSchema.validate(personLike);
        } catch {
          console.error(
            "[WS message handler] invalid person partial payload",
            personLike
          );
          return;
        }

        // here will be our person
        let person: Person;

        // figuring out with person handshake or not
        if (personLike.title) {
          person = personLike as Person;
          // save person ins storage
          await this.state.storage.put(person.identity, person);

          console.info("[WS message handler] a Person stored", person);
        } else {
          // it's a handshake i.e. it's a first person message
          console.info(
            "[WS message handler] a Person handshake requested",
            personLike
          );
          // do we already have this person?
          const personOrUndefined = await this.state.storage.get<Person>(
            (personLike as PersonHandshake).identity
          );
          if (!personOrUndefined) {
            person = {
              identity: (personLike as PersonHandshake).identity,
              title: (personLike as PersonHandshake).identity.substring(0, 4),
            };

            console.info(
              "[WS message handler] no Person stored yet, creating a new one"
            );

            await this.state.storage.put(person.identity, person);

            console.info("[WS message handler] a Person stored", person);
          } else {
            person = personOrUndefined;
            console.info(
              "[WS message handler] found a person",
              personOrUndefined
            );
          }
        }

        // do we already have saved session for this person?
        let session = this.sessions.find(
          (session) => session.person.identity === person.identity
        );

        if (!session) {
          // join message for all except current session
          this.broadcastSystemMessage(`${person.title} joined`);

          // add current session
          session = {
            ws: webSocket,
            person,
          };

          this.sessions.push(session);
        } else {
          session.person = person; // update person info
        }

        // broadcast all online persons (with current) for all sessions
        this.broadcastPersons(this.sessions.map((session) => session.person));
      }

      /** PostBody switch end */
    });

    const closeOrErrorHandler = (): void => {
      const quitter = this.sessions.find((session) => session.ws === webSocket);

      if (quitter) {
        this.sessions = this.sessions.filter(
          (session) => session.ws !== webSocket
        );

        // quit message
        this.broadcastSystemMessage(`${quitter.person.title} quit`);
      } else {
        console.error(
          "WebSocket closed, but can't find it's session. Zombie session detected!"
        );
      }
    };

    webSocket.addEventListener("close", closeOrErrorHandler);
    webSocket.addEventListener("error", closeOrErrorHandler);
  }
}
