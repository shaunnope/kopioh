/**
 * Handlers relating to:
 * connecting of groups to channels,
 * registering moderators,
 * Posting queue overrides - manual trigger
 */
import { Composer, InlineKeyboard, type Middleware, type NextFunction } from "grammy";
import { Context, TryDeleteMessage } from "../context.ts";
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
 * Middleware: confirm the bot holds admin rights in the chat before proceeding.
 * getChatMember returns accurate admin/creator status only when the bot is itself an admin.
 * Answers the callback query with an alert and short-circuits if the bot lacks those rights.
 */
async function requireBotAdmin(ctx: Context, next: NextFunction) {
  const botMember = await ctx.getChatMember(ctx.me.id);
  if (botMember.status !== "administrator" && botMember.status !== "creator") {
    await ctx.answerCallbackQuery({ text: ctx.t("connect.bot_not_admin") });
    return;
  }
  await next();
}

/**
 * Process a connection request
 */
const processConnect: Middleware<Context> = async (ctx) => {
  const userId = ctx.from!.id;
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
    await db.coerceUser(userId);
    await db.assignConnectionRole(userId, connectionId, "admin");
    await ctx.reply(ctx.t("connect.success"));
    return;
  }

  // otherwise, send message to be forwarded to the broadcast channel;
  // userId is embedded so the channel handler can assign the admin role
  const sent = await ctx.reply(ctx.t("connect.forward_prompt") + `\n[${submitId};0;${userId}]`);
  await ctx.api.editMessageText(
    submitId,
    sent.message_id,
    ctx.t("connect.forward_prompt") + `\n[${submitId};${sent.message_id};${userId}]`,
  );
}

/**
 * Process a disconnect request
 * @param ctx 
 */
const processDisconnect: Middleware<Context> = async (ctx) => {
  const submitId = ctx.chat!.id;
  const deleted = await db.deleteConnection(submitId)
  console.log(submitId, deleted)
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
    await TryDeleteMessage(ctx)
    return next();
  },
  processConnect
)

// Inline button confirmation for anonymous admins
groupFeature.callbackQuery(
  /^verify:(connect|disconnect)$/,
  logHandle("callback-connect-verify"),
  requireBotAdmin,
  async (ctx) => {
    const action = ctx.match[1] as "connect" | "disconnect";
    const userId = ctx.from.id;

    const member = await ctx.getChatMember(userId);
    if (member.status !== "creator" && member.status !== "administrator") {
      await ctx.answerCallbackQuery({ text: ctx.t("connect.not_admin"), show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    await TryDeleteMessage(ctx);

    if (action === "connect") {
      await processConnect(ctx, () => Promise.resolve());
      return;
    }

    await processDisconnect(ctx, () => Promise.resolve());
  }
)

// Disconnect broadcast channel
groupFeature.command(
  "disconnect",
  logHandle("command-disconnect"),
  async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!await validateUser(userId, ctx, "disconnect"))
      return;
    await TryDeleteMessage(ctx)
    await next()
  },
  processDisconnect
)

/**
 * Resolve the target user from a command context.
 * Prefers a replied-to message; falls back to a text_mention entity.
 * Returns null if no resolvable target is found.
 */
function resolveTarget(ctx: Context): { id: number; name: string } | null {
  const replyFrom = ctx.message?.reply_to_message?.from;
  if (replyFrom && !replyFrom.is_bot) {
    return { id: replyFrom.id, name: replyFrom.first_name };
  }

  for (const entity of ctx.message?.entities ?? []) {
    // greedily uses the first mentioned user for target resolution
    if (entity.type === "text_mention" && !entity.user.is_bot) {
      return { id: entity.user.id, name: entity.user.first_name };
    }
  }

  return null;
}

// Assign moderator role to a member of the connected broadcast
groupFeature.command(
  "mod",
  logHandle("command-mod"),
  async (ctx) => {
    const issuerId = ctx.from?.id;
    if (!issuerId) return;

    await TryDeleteMessage(ctx);

    const connection = await db.getConnectionBySubmitId(ctx.chat.id);
    if (!connection) {
      await ctx.reply(ctx.t("connect.not_connected"));
      return;
    }

    if (!await db.isUserAdmin(issuerId, connection.id)) {
      await ctx.reply(ctx.t("connect.not_authorized"));
      return;
    }

    const target = resolveTarget(ctx);
    if (!target) {
      await ctx.reply(ctx.t("connect.mod_no_target"));
      return;
    }

    if (target.id === issuerId) {
      await ctx.reply(ctx.t("connect.mod_self"));
      return;
    }

    if (await db.isUserAdmin(target.id, connection.id)) {
      await ctx.reply(ctx.t("connect.mod_is_admin", { name: target.name }));
      return;
    }

    await db.coerceUser(target.id);
    await db.assignConnectionRole(target.id, connection.id, "moderator");
    await ctx.reply(ctx.t("connect.mod_success", { name: target.name }));
  }
)

// Remove moderator role from a member of the connected broadcast
groupFeature.command(
  "unmod",
  logHandle("command-unmod"),
  async (ctx) => {
    const issuerId = ctx.from?.id;
    if (!issuerId) return;

    await TryDeleteMessage(ctx);

    const connection = await db.getConnectionBySubmitId(ctx.chat.id);
    if (!connection) {
      await ctx.reply(ctx.t("connect.not_connected"));
      return;
    }

    if (!await db.isUserAdmin(issuerId, connection.id)) {
      await ctx.reply(ctx.t("connect.not_authorized"));
      return;
    }

    const target = resolveTarget(ctx);
    if (!target) {
      await ctx.reply(ctx.t("connect.mod_no_target"));
      return;
    }

    if (target.id === issuerId) {
      await ctx.reply(ctx.t("connect.mod_self"));
      return;
    }

    if (await db.isUserAdmin(target.id, connection.id)) {
      await ctx.reply(ctx.t("connect.mod_is_admin", { name: target.name }));
      return;
    }

    await db.removeConnectionRole(target.id, connection.id);
    await ctx.reply(ctx.t("connect.unmod_success", { name: target.name }));
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
    const match = text.match(/\[(-?\d+);(\d+);(\d+)\]/);
    if (!match) {
      await ctx.reply(ctx.t("connect.invalid_message"));
      return;
    }

    const submitId = Number(match[1]);
    const originalMsgId = Number(match[2]);
    const initiatorId = Number(match[3]);
    const broadcastId = ctx.chat.id;
    const connectionId = await db.createConnection(broadcastId, submitId);

    if (connectionId === null) {
      await ctx.reply(ctx.t("connect.already_exists"));
      return;
    }

    await db.coerceUser(initiatorId);
    await db.assignConnectionRole(initiatorId, connectionId, "admin");

    await Promise.all([
      ctx.deleteMessage(),
      ctx.api.deleteMessage(submitId, originalMsgId),
      ctx.api.sendMessage(submitId, ctx.t("connect.success")),
    ]);
  }
)

export { composer as connectionFeature }
