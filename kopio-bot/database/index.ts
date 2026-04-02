import { createClient, SupabaseClientOptions } from "npm:@supabase/supabase-js@2.86.0";
import { config } from "../config.ts";
import { logger } from "../logger.ts";
import type { Database } from "./database.types.ts"

function getDb() {
  return config.env_isProd ? "public" : "development"
}

const client = createClient<Database>(
  config.SUPABASE_URL, 
  config.SUPABASE_KEY,
)

/**
 * 
 * Get user by Telegram user ID, 
 * or create a new user if it does not exist in the table.
 * @param userId
 * @returns the user object, if get or created
 */
async function coerceUser(userId: number) {
  const table = "users"
  try {
      // Check if user exists in database
      const { data: existingUser } = await client
        .from(table)
        .select("id")
        // .upsert("id", userId)
        .eq("id", userId)
        .single();

        if (existingUser !== null)
          return true

      // If user doesn't exist, add them to the database
      const res = await client
        .from(table)
        .insert({ id: userId });

    } catch (error) {
      logger.error(`Error in getUser:\n${error}`)
    }
} 

export default {
  client,
  getUser: coerceUser
}