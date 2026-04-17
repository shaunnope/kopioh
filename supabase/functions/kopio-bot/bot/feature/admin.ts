/**
 * Admin-only commands, restricted to the bot owner.
 */
import { Composer } from "grammy"

import type { Context } from "../context.ts"
import { logHandle } from "../helper/logging.ts"
import { setCommandsHandler } from "../helper/setcommand.ts"
import { config } from "../../config.ts"
import db from "../../database/index.ts"

const composer = new Composer<Context>()

// Guard: only the bot owner can use these commands
const ownerFilter = composer.filter(ctx => ctx.from?.id === config.BOT_OWNER_ID)

ownerFilter.command(
  "setcommands",
  logHandle("command-setcommands"),
  setCommandsHandler,
)

ownerFilter.command(
  "setdefault",
  logHandle("command-setdefault"),
  async (ctx) => {
    const connection = ctx.session.connection;
    if (!connection) {
      await ctx.reply(ctx.t("admin.setdefault-no-connection"));
      return;
    }
    await db.setDefaultConnection(connection.id);
    await ctx.reply(ctx.t("admin.setdefault-success"));
  },
)

export { composer as adminFeature }
