import { Composer } from "https://deno.land/x/grammy@v1.42.0/mod.ts";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";

const composer = new Composer<Context>()

const groupFeature = composer.chatType(["group", "supergroup"])
const channelFeature = composer.chatType("channel")

groupFeature.command(
  "connect",
  logHandle("command-connect"),
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const member = await ctx.getChatMember(userId);
    if (member.status !== "creator") {
      await ctx.reply(ctx.t("connect.not_admin"));
      return;
    }

    const submitId = ctx.chat.id;
    const existing = await db.getConnectionBySubmitId(submitId);
    if (existing) {
      await ctx.reply(ctx.t("connect.already_connected"));
      return;
    }

    const sent = await ctx.reply(ctx.t("connect.forward_prompt") + `\n[${submitId};0]`);
    await ctx.api.editMessageText(
      submitId,
      sent.message_id,
      ctx.t("connect.forward_prompt") + `\n[${submitId};${sent.message_id}]`,
    );
  }
)

groupFeature.command(
  "disconnect",
  logHandle("command-disconnect"),
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const member = await ctx.getChatMember(userId);
    if (member.status !== "creator") {
      await ctx.reply(ctx.t("connect.not_admin"));
      return;
    }

    const submitId = ctx.chat.id;
    const deleted = await db.deleteConnection(submitId);

    if (!deleted) {
      await ctx.reply(ctx.t("connect.not_connected"));
      return;
    }

    await ctx.reply(ctx.t("connect.disconnected"));
  }
)

channelFeature.on(
  "channel_post",
  logHandle("channel-post-connect"),
  async (ctx) => {
    const post = ctx.channelPost;
    const origin = post.forward_origin;

    if (!origin || origin.type !== "user") return;
    if (!origin.sender_user.is_bot || origin.sender_user.id !== ctx.me.id) return;

    const text = post.text ?? "";
    const match = text.match(/\[(-?\d+);(\d+)\]/);
    if (!match) {
      await ctx.reply(ctx.t("connect.invalid_message"));
      return;
    }

    const submitId = Number(match[1]);
    const originalMsgId = Number(match[2]);
    const broadcastId = ctx.chat.id;
    const connectionId = await db.createConnection(broadcastId, submitId);

    if (connectionId === null) {
      await ctx.reply(ctx.t("connect.already_exists"));
      return;
    }

    await Promise.all([
      ctx.deleteMessage(),
      ctx.api.deleteMessage(submitId, originalMsgId),
      ctx.api.sendMessage(submitId, ctx.t("connect.success")),
    ]);
  }
)

export { composer as connectionFeature }
