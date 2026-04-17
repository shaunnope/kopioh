import "./command.ts"
import { logOuput, runCommand } from "./command.ts";

const PROJECT_REF = Deno.env.get("PROJECT_ID");
const PLATFORM = Deno.env.get("PLATFORM")

async function deploy() {
  if (!PROJECT_REF) throw new Error("PROJECT_ID is unset");
  switch (PLATFORM) {
    case "supabase":
    default:
    {
      const FUNCTION = Deno.env.get("FUNCTION")
      if (!FUNCTION) throw new Error("FUNCTION is unset");
      console.log(`Deploying ${FUNCTION} to ${PLATFORM}@${PROJECT_REF}`)
      // deploy function
      const res = await runCommand("supabase", [
        "functions",
        "deploy",
        "--no-verify-jwt",
        "--project-ref",
        PROJECT_REF,
        FUNCTION
      ]);
      logOuput(res);
    }
  }
}

await deploy()


