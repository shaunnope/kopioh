import { Composer } from "https://deno.land/x/grammy@v1.38.4/mod.ts";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { config } from "../../config.ts";

// Initialize Supabase client
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY)


const composer = new Composer<Context>()

const feature = composer.chatType("private")
const groupFeature = composer.chatType(["group", "supergroup"])

feature.command(
  "start", 
  logHandle("command-start"), 
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      // Check if user exists in database
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      // If user doesn't exist, add them to the database
      if (!existingUser) {
        await supabase
          .from('users')
          .insert({
            id: userId,
            created_at: new Date().toISOString(),
            last_updated: new Date().toISOString(),
            points: 0,
            role: 'user'
          });
      }
    } catch (error) {
      console.error('Database error in start command:', error);
      
    }
    await ctx.reply(ctx.t("welcome"));
  }
)
groupFeature.command(
  "start", 
  logHandle("command-start"), 
  ctx => ctx.reply(ctx.t("welcome.group"))
)

export { composer as welcomeFeature }
