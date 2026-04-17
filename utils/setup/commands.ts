// Setup script: pushes command lists and description to the edge function.
// Run with env vars set: PROJECT_ID, BOT_TOKEN, FUNCTION
const PROJECT_REF  = Deno.env.get("PROJECT_ID");
const BOT_TOKEN    = Deno.env.get("BOT_TOKEN");

if (!PROJECT_REF)  throw new Error("PROJECT_ID is unset");
if (!BOT_TOKEN)    throw new Error("BOT_TOKEN is unset");

const DEPLOY_ENV = Deno.env.get("DEPLOY_ENV") ?? "production";
const FUNCTION     = Deno.env.get("FUNCTION") ?? "kopio-bot";
const PLATFORM_KEY = Deno.env.get("PLATFORM_KEY") ?? "placeholder";

const BASE_URL = DEPLOY_ENV === "production" 
  ? `https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION}`
  : `http://127.0.0.1:54321/functions/v1/${FUNCTION}`;

// ── helpers ───────────────────────────────────────────────────────────────────

async function readLocale(filename: string): Promise<unknown> {
  const path = new URL(`../../locales/en/${filename}`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(path));
}

async function call(method: string, path: string, body?: unknown) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${PLATFORM_KEY}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  const label = `${method} ${path}`;
  if (!res.ok) {
    console.error(`✗  ${label}  →  ${res.status}`, json);
  } else {
    console.log(`✓  ${label}  →  ${res.status}`);
  }
}

// ── tasks ─────────────────────────────────────────────────────────────────────

async function setupCommands() {
  const [defaultCmds, groupCmds, ownerCmds] = await Promise.all([
    readLocale("commands.default.json"),
    readLocale("commands.group.json"),
    readLocale("commands.owner.json"),
  ]);

  await call("POST", "/setup/commands/private", defaultCmds);
  await call("POST", "/setup/commands/group",   groupCmds);
  await call("POST", "/setup/commands/owner",   ownerCmds);
}

async function setupDescription() {
  const desc = await readLocale("description.json");
  await call("POST", "/setup/description", desc);
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log(`Setting up commands for ${FUNCTION} on ${PROJECT_REF}…\n${BASE_URL}`);
await setupCommands();
await setupDescription();
console.log("Done.");
