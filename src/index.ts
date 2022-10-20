import { Router } from "@tsndr/cloudflare-worker-router";
import { ValidationError } from "yup";
import { PostBody, PostBodySchema, PostBodyUnsigned } from "./types/PostBody";
import { verify } from "./helpers/verify";
import { Person, PersonSchema } from "./types/HubState";
import identity from "./helpers/identity";
import { HubService } from "./services/HubService";
import { add } from "date-fns";
import config from "./config";

export interface Env {
  SALT: string;
  HUDDLESS: KVNamespace;
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

/** =====================
 * WEBSOCKET
 * ====================== */
const handleSession = async (websocket: WebSocket, env: Env): Promise<void> => {
  const hubService = new HubService(env);
  const tick = async (postBody?: PostBody): Promise<void> => {
    try {
      const state = await hubService.getState();
      const stateJsonSnapshot = JSON.stringify(state);

      /** Drop Old Messages */
      state.messages = state.messages.filter(
        (m) =>
          add(new Date(m.date), { seconds: config.dissolveTime }) > new Date()
      );

      /** Websocket routing */

      if (postBody && postBody.type === "HANDSHAKE") {
        console.log("HANDSHAKE", postBody);
      } else if (postBody && postBody.type === "MESSAGE") {
        console.log("MESSAGE", postBody);
        state.messages.push({
          identity: await identity(postBody.publicKey),
          body: postBody.body,
          date: new Date(),
        });
      } else if (postBody && postBody.type === "PERSON") {
        console.log("PERSON", postBody);
        const personLike = JSON.parse(postBody.body);
        await PersonSchema.validate(personLike);
        const person: Person = personLike as Person;

        // check permissions and apply
        const claimedIdentity = await identity(postBody.publicKey);
        if (person.identity === claimedIdentity) {
          console.log("Permission granted, identity:", claimedIdentity);

          const oldPerson = state.persons.find(
            (p) => p.identity === claimedIdentity
          );

          if (oldPerson) {
            state.persons = state.persons.map((p) =>
              p.identity === claimedIdentity ? person : p
            );
          } else {
            state.persons.push(person);
          }
        }
      }

      /** Update state */
      if (JSON.stringify(state) !== stateJsonSnapshot) {
        await hubService.saveState(state);
      }

      websocket.send(JSON.stringify(state));
    } catch (e) {
      console.log(e);
    }
  };

  websocket.accept();

  websocket.addEventListener("message", async ({ data }) => {
    if (data instanceof ArrayBuffer) return;

    try {
      const obj = JSON.parse(data);
      await PostBodySchema.validate(obj);
      const postBody = obj as PostBody;
      const postBodyUnsigned: PostBodyUnsigned = {
        type: postBody.type,
        body: postBody.body,
        publicKey: postBody.publicKey,
      };

      const trusted = await verify(
        JSON.stringify(postBodyUnsigned),
        postBody.signature,
        postBody.publicKey
      );

      if (trusted) {
        await tick(postBody);
      } else {
        console.error("Untrusted");
      }
    } catch (e) {
      console.error(e);
    }
  });

  websocket.addEventListener("close", async () => {
    clearInterval(interval);
  });

  const interval = setInterval(async () => await tick(), config.dissolveTime);
};

const websocketHandler = async (
  request: Request,
  env: Env
): Promise<Response> => {
  const upgradeHeader = request.headers.get("Upgrade");
  if (upgradeHeader !== "websocket") {
    return new Response("Expected websocket", { status: 400 });
  }

  const [client, server] = Object.values(new WebSocketPair());
  await handleSession(server, env);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/ws/":
        console.log("Websocket requested");
        return await websocketHandler(request, env);
      default:
        return await router.handle(env, request);
    }
  },
};
