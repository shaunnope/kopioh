// Upload a directory of files to a Supabase Storage bucket.
// Env vars (see supabase/functions/kopio-bot/config.ts for reference):
//   PROJECT_ID    — Supabase project reference id
//   PLATFORM_KEY  — service role key (for storage auth)
//   S3FS_BUCKET   — target bucket name (default: "bot-assets")
//   LOCALES_DIR   — destination prefix inside the bucket (default: "locales")
// Usage:
//   deno run --allow-env --allow-read --allow-net --env-file=.env.prod utils/upload.ts [source-dir]
//   source-dir defaults to supabase/functions/kopio-bot/locales/

import { walk } from "jsr:@std/fs/walk";
import { relative } from "jsr:@std/path";

const PROJECT_ID  = Deno.env.get("PROJECT_ID");
const PLATFORM_KEY = Deno.env.get("PLATFORM_KEY");
const BUCKET      = Deno.env.get("S3FS_BUCKET") ?? "bot-assets";
const DEST_PREFIX = Deno.env.get("LOCALES_DIR") ?? "locales";
const SOURCE_DIR  = Deno.args[0] ?? "supabase/functions/kopio-bot/locales";

if (!PROJECT_ID)   throw new Error("PROJECT_ID is unset");
if (!PLATFORM_KEY) throw new Error("PLATFORM_KEY is unset");

const BASE_URL = `https://${PROJECT_ID}.supabase.co/storage/v1/object/${BUCKET}`;

async function uploadFile(localPath: string, remotePath: string) {
  const data = await Deno.readFile(localPath);
  const url = `${BASE_URL}/${remotePath}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PLATFORM_KEY}`,
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
    },
    body: data,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to upload ${remotePath}: ${res.status} ${body}`);
  }

  console.log(`✓ ${remotePath}`);
}

async function upload() {
  console.log(`Uploading ${SOURCE_DIR} → ${BUCKET}/${DEST_PREFIX}`);

  const tasks: Promise<void>[] = [];
  for await (const entry of walk(SOURCE_DIR, { includeDirs: false })) {
    const rel = relative(SOURCE_DIR, entry.path).replaceAll("\\", "/");
    const remotePath = `${DEST_PREFIX}/${rel}`;
    tasks.push(uploadFile(entry.path, remotePath));
  }

  await Promise.all(tasks);
  console.log(`\nDone — ${tasks.length} file(s) uploaded.`);
}

await upload();
