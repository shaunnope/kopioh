// function entry point
import { webhookCallback } from "grammy";
import { getBot } from "./bot/index.ts";
import { config } from "./config.ts";
import { deleteCommands, setCommands } from "./api/setup.commands.ts";
import { deleteDescription, setDescription } from "./api/setup.description.ts";
import { handleCronPost } from "./api/cron.ts";

const bot = getBot();
const handleUpdate = webhookCallback(bot, "std/http");

type Handler = (req: Request, match: URLPatternResult) => Promise<Response>;

/** Validates the Authorization header before passing through to the handler. */
function withAuth(handler: Handler): Handler {
  return (req, match) => {
    const header = req.headers.get("Authorization");
    const secret = header?.startsWith("Bearer ") ? header.slice(7) : header;
    if (secret !== config.PLATFORM_KEY) {
      return Promise.resolve(new Response("unauthorized", { status: 401 }));
    }
    return handler(req, match);
  };
}

const routes: { method: string; pattern: URLPattern; handler: Handler }[] = [
  { // The main entrypoint: webhook url
    method: "POST",
    pattern: new URLPattern({ pathname: "/kopio-bot" }),
    handler: async (req) => {
      const url = new URL(req.url)
      // NOTE: webhook auth must be part of a fixed url: url pattern, search params
      if (url.searchParams.get("secret") !== bot.token) {
        return new Response("not allowed", { status: 405 });
      }

      return await handleUpdate(req)
    },
  },
  { // setup command info
    method: "POST",
    pattern: new URLPattern({ pathname: "/kopio-bot/setup/commands/:scope{/:lang}?" }),
    handler: withAuth((req, match) => setCommands(bot, req, match)),
  },
  { // delete command info
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/kopio-bot/setup/commands/:scope{/:lang}?" }),
    handler: withAuth((req, match) => deleteCommands(bot, req, match)),
  },
  { // set description
    method: "POST",
    pattern: new URLPattern({ pathname: "/kopio-bot/setup/description{/:lang}?" }),
    handler: withAuth((req, match) => setDescription(bot, req, match)),
  },
  { // delete description
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/kopio-bot/setup/description{/:lang}?" }),
    handler: withAuth((req, match) => deleteDescription(bot, req, match)),
  },
  { // cron: dequeue and post one approved submission per due broadcast
    method: "POST",
    pattern: new URLPattern({ pathname: "/kopio-bot/cron/post" }),
    handler: withAuth(() => handleCronPost(bot.api)),
  },
];

function findRoute(method: string, url: URL) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(url);
    if (match) return { route, match };
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const result = findRoute(req.method, url);
    if (!result) {
      console.error(`No valid route: ${url}`);
      return new Response("not found", { status: 404 });
    }
    return await result.route.handler(req, result.match);
  } catch (err) {
    console.error(err);
    return new Response("internal server error", { status: 500 });
  }
});