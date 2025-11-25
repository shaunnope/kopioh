import "./command.ts"
import { logOuput, runCommand } from "./command.ts";

const PROJECT_REF = Deno.env.get("SUPABASE_PROJECT_ID");
if (!PROJECT_REF) throw new Error("SUPABASE_PROJECT_ID is unset");

// deploy function
const res = await runCommand("supabase", [
      "functions",
      "deploy",
      "--no-verify-jwt",
      "--project-ref",
      PROJECT_REF,
      "kopioh-bot"
    ]);
logOuput(res);

