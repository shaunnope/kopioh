import { Composer, InlineKeyboard, Middleware } from "grammy";
import { Context } from "../context.ts";
import { logHandle } from "../helper/logging.ts";
import db from "../../database/index.ts";

const composer = new Composer<Context>()

const groupFeature = composer.chatType(["group", "supergroup"])
const channelFeature = composer.chatType("channel")

// Telegram's built-in "Group Anonymous Bot" user ID — used when an admin posts anonymously
const ANON_ADMIN_ID = 1087968824;

/**
 * Validate that a user can perform the (dis)connect request.
 * If the user is anonymous, replies with an inline verification button and returns false.
 */
async function validateUser(userId: number, ctx: Context, action: "connect" | "disconnect") {
  if (userId === ANON_ADMIN_ID) {
    await ctx.reply(ctx.t("connect.verify_prompt"), {
      reply_markup: new InlineKeyboard().text(ctx.t("connect.verify_button"), `verify:${action}`),
    });
    return false;
  }

  const member = await ctx.getChatMember(userId);
  if (member.status !== "creator") {
    await ctx.reply(ctx.t("connect.not_admin"));
    return false;
  }

  return true;
}

/**
 * Process a connection request
 */
const processConnect: Middleware<Context> = async (ctx) => {
  const submitId = ctx.chat!.id;
  const existing = await db.getConnectionBySubmitId(submitId);
  if (existing) {
    await ctx.reply(ctx.t("connect.already_connected"));
    return;
  }

  // if the group is set as a discussion chat for a channel, use the channel directly
  const chatInfo = await ctx.api.getChat(submitId);
  if ("linked_chat_id" in chatInfo && chatInfo.linked_chat_id) {
    const connectionId = await db.createConnection(chatInfo.linked_chat_id, submitId);
    if (connectionId === null) {
      await ctx.reply(ctx.t("connect.already_exists"));
      return;
    }
    await ctx.reply(ctx.t("connect.success"));
    return;
  }

  // otherwise, send message to be forwarded to the broadcast channel
  const sent = await ctx.reply(ctx.t("connect.forward_prompt") + `\n[${submitId};0]`);
  await ctx.api.editMessageText(
    submitId,
    sent.message_id,
    ctx.t("connect.forward_prompt") + `\n[${submitId};${sent.message_id}]`,
  );
}

/**
 * Process a disconnect request
 * @param ctx 
 */
const processDisconnect: Middleware<Context> = async (ctx) => {
  const submitId = ctx.chat!.id;
  const deleted = await db.deleteConnection(submitId)
  const reply = deleted ? ctx.t("connect.disconnected") : ctx.t("connect.not_connected")
  await ctx.reply(reply)
}

// Request to connect a broadcast channel
groupFeature.command(
  "connect",
  logHandle("command-connect"),
  async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!await validateUser(userId, ctx, "connect"))
      return;
    await ctx.deleteMessage()
    return next();
  },
  processConnect
)

// Inline button confirmation for anonymous admins
groupFeature.callbackQuery(/^verify:(connect|disconnect)$/, logHandle("callback-connect-verify"), async (ctx) => {
  const action = ctx.match[1] as "connect" | "disconnect";
  const userId = ctx.from.id;

  const member = await ctx.getChatMember(userId);
  if (member.status !== "creator" && member.status !== "administrator") {
    await ctx.answerCallbackQuery({ text: ctx.t("connect.not_admin"), show_alert: true })
    return
  }

  await ctx.answerCallbackQuery();
  await ctx.deleteMessage();

  if (action === "connect") {
    await processConnect(ctx, () => Promise.resolve())
    return
  }

  await processDisconnect(ctx, () => Promise.resolve())
})

// Disconnect broadcast channel
groupFeature.command(
  "disconnect",
  logHandle("command-disconnect"),
  async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!await validateUser(userId, ctx, "disconnect"))
      return;
    await ctx.deleteMessage()
    await next()
  },
  processDisconnect
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
