import { Composer, Middleware } from "https://deno.land/x/grammy@v1.42.0/mod.ts";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";

const composer = new Composer<Context>()

const groupFeature = composer.chatType(["group", "supergroup"])
const channelFeature = composer.chatType("channel")

/**
 * Validate that a user can perform the (dis)connect request
 * @param userId 
 * @param ctx 
 * @returns 
 */
async function validateUser(userId: number, ctx: Context) {
  const member = await ctx.getChatMember(userId);
  if (member.status !== "creator") {
    // if user is anonymous, reply with an inline button
    // TODO
    // otherwise, reject
    await ctx.reply(ctx.t("connect.not_admin"));
    return false;
  }

  return true
}
/**
 * Process a connection request
 * @param ctx 
 * @returns 
 */
const processConnect : Middleware<Context> = async (ctx) => {
  const submitId = ctx.chat!.id;
  const existing = await db.getConnectionBySubmitId(submitId);
  if (existing) {
    await ctx.reply(ctx.t("connect.already_connected"));
    return;
  }

  // if the group is set as a discussion chat for a channel, use the channel
  // TODO

  // otherwise, send message to be forwarded
  const sent = await ctx.reply(ctx.t("connect.forward_prompt") + `\n[${submitId};0]`);
  await ctx.api.editMessageText(
    submitId,
    sent.message_id,
    ctx.t("connect.forward_prompt") + `\n[${submitId};${sent.message_id}]`,
  );
}

// Request to connect a broadcast channel
groupFeature.command(
  "connect",
  logHandle("command-connect"),
  async (ctx, next) => { // validate user
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!await validateUser(userId, ctx))
      return;
    
    return next()
  },
  processConnect
)

// process inline button confirmation
groupFeature.callbackQuery("TODO", processConnect)

// disconnect broadcast channel
groupFeature.command(
  "disconnect",
  logHandle("command-disconnect"),
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!await validateUser(userId, ctx))
      return;

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
