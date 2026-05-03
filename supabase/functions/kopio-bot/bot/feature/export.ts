import { Composer, InputFile } from "grammy";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";
import { isConnected } from "../helper/connection.ts";

const composer = new Composer<Context>();
const feature = composer.chatType("private");

feature.command("export", logHandle("command-export"), async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const connection = ctx.session.connection;
  if (!isConnected(ctx, connection) || !connection) return;

  if (await db.getConnectionRole(userId, connection.id) !== "admin") {
    await ctx.reply(ctx.t("export.not-admin"));
    return;
  }

  const rows = await db.getSubmissionsForExport(connection.broadcastId);
  if (rows.length === 0) {
    await ctx.reply(ctx.t("export.empty"));
    return;
  }

  const json = JSON.stringify(rows, null, 2);
  const bytes = new TextEncoder().encode(json);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `submissions.${connection.broadcastId}-${date}.json`;

  await ctx.replyWithDocument(new InputFile(bytes, filename), {
    caption: ctx.t("export.caption", { count: rows.length }),
  });
});

export { composer as exportFeature };
