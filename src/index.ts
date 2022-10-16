import { Router } from "@tsndr/cloudflare-worker-router";

export interface Env {
  SALT: string;
}

// Initialize router
const router = new Router();

// Enabling build in CORS support
router.cors({
  allowOrigin: "*",
});

// Simple get
router.get("/status", ({ req, res }) => {
  res.body = {
    status: "ok",
  };
});

export const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return await router.handle(env, request);
  },
};
