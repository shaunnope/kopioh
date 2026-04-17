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
import { log, userName } from "../log.ts";

const composer = new Composer<Context>()

const groupFeature = composer.chatType(["group", "supergroup"])
const privateFeature = composer.chatType("private")
const channelFeature = composer.chatType("channel")

// Telegram's built-in "Group Anonymous Bot" user ID — used when an admin posts anonymously
const ANON_ADMIN_ID = 1087968824;

/**
 * Validate that a user can perform the (dis)connect request.
 * If the user is anonymous, replies with an inline verification button and returns false.
 */
async function validateUser(userId: number, ctx: Context, action: "connect" | "disconnect" | "resetroles") {
  if (userId === ANON_ADMIN_ID) {
    await ctx.reply(ctx.t("connect.verify-prompt"), {
      reply_markup: new InlineKeyboard().text(ctx.t("connect.verify-button"), `verify:${action}`),
    });
    return false;
  }

  const member = await ctx.getChatMember(userId);
  if (member.status !== "creator") {
    await ctx.reply(ctx.t("connect.not-admin"));
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
    await ctx.answerCallbackQuery({ text: ctx.t("connect.bot-not-admin") });
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
    await ctx.reply(ctx.t("connect.already-connected"));
    return;
  }

  // if the group is set as a discussion chat for a channel, use the channel directly
  const chatInfo = await ctx.api.getChat(submitId);
  if ("linked_chat_id" in chatInfo && chatInfo.linked_chat_id) {
    const connectionId = await db.createConnection(chatInfo.linked_chat_id, submitId);
    if (connectionId === null) {
      await ctx.reply(ctx.t("connect.already-exists"));
      return;
    }
    await db.coerceUser(userId);
    await db.assignConnectionRole(userId, connectionId, "admin");
    await ctx.reply(ctx.t("connect.success"));
    return;
  }

  // otherwise, send message to be forwarded to the broadcast channel;
  // userId is embedded so the channel handler can assign the admin role
  const sent = await ctx.reply(ctx.t("connect.forward-prompt") + `\n[${submitId};0;${userId}]`);
  await ctx.api.editMessageText(
    submitId,
    sent.message_id,
    ctx.t("connect.forward-prompt") + `\n[${submitId};${sent.message_id};${userId}]`,
  );
}

/**
 * Process a disconnect request
 * @param ctx
 */
const processDisconnect: Middleware<Context> = async (ctx) => {
  const submitId = ctx.chat!.id;
  const existing = await db.getConnectionBySubmitId(submitId);
  log(ctx.api, existing?.logs_id, { type: "connection.deleted" }, { 
    get: () => db.getConnectionConfig(existing!.id).then(cfg => cfg.log_excluded_events)
  });

  const deleted = await db.deleteConnection(submitId)
  console.log(submitId, deleted)
  const reply = deleted ? ctx.t("connect.disconnected") : ctx.t("connect.not-connected")
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

async function executeResetRoles(
  ctx: Context,
  userId: number,
  connectionId: string,
  logsId: number | null,
): Promise<void> {
  await db.coerceUser(userId);
  await db.resetConnectionRoles(connectionId, userId);
  await ctx.reply(ctx.t("connect.resetroles-success"));
  log(ctx.api, logsId, {
    type: "role.reset",
    byName: userName(ctx.from!),
  }, {
    get: () => db.getConnectionConfig(connectionId).then(cfg => cfg.log_excluded_events),
  });
}

// Inline button confirmation for anonymous admins
groupFeature.callbackQuery(
  /^verify:(connect|disconnect|resetroles)$/,
  logHandle("callback-connect-verify"),
  requireBotAdmin,
  async (ctx) => {
    const action = ctx.match[1] as "connect" | "disconnect" | "resetroles";
    const userId = ctx.from.id;

    const member = await ctx.getChatMember(userId);
    if (member.status !== "creator" && member.status !== "administrator") {
      await ctx.answerCallbackQuery({ text: ctx.t("connect.not-admin"), show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    await TryDeleteMessage(ctx);

    if (action === "resetroles") {
      const connection = await db.getConnectionBySubmitId(ctx.chat!.id);
      if (!connection) { await ctx.reply(ctx.t("connect.not-connected")); return; }
      await executeResetRoles(ctx, userId, connection.id, connection.logs_id);
      return;
    }

    const process = action === "connect" ? processConnect : processDisconnect;
    await process(ctx, () => Promise.resolve())
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
      await ctx.reply(ctx.t("connect.not-connected"));
      return;
    }

    if (!await db.isUserAdmin(issuerId, connection.id)) {
      await ctx.reply(ctx.t("connect.not-authorized"));
      return;
    }

    const target = resolveTarget(ctx);
    if (!target) {
      await ctx.reply(ctx.t("connect.mod-no-target"));
      return;
    }

    if (target.id === issuerId) {
      await ctx.reply(ctx.t("connect.mod-self"));
      return;
    }

    if (await db.isUserAdmin(target.id, connection.id)) {
      await ctx.reply(ctx.t("connect.mod-is-admin", { name: target.name }));
      return;
    }

    await db.coerceUser(target.id);
    await db.assignConnectionRole(target.id, connection.id, "moderator");
    await ctx.reply(ctx.t("connect.mod-success", { name: target.name }));
    log(ctx.api, connection.logs_id, {
        type: "role.added",
        targetName: target.name,
        roleName: "moderator",
        byName: userName(ctx.from!),
      }, {
        get: () => db.getConnectionConfig(connection.id).then(cfg => cfg.log_excluded_events)
      });
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
      await ctx.reply(ctx.t("connect.not-connected"));
      return;
    }

    if (!await db.isUserAdmin(issuerId, connection.id)) {
      await ctx.reply(ctx.t("connect.not-authorized"));
      return;
    }

    const target = resolveTarget(ctx);
    if (!target) {
      await ctx.reply(ctx.t("connect.mod-no-target"));
      return;
    }

    if (target.id === issuerId) {
      await ctx.reply(ctx.t("connect.mod-self"));
      return;
    }

    if (await db.isUserAdmin(target.id, connection.id)) {
      await ctx.reply(ctx.t("connect.mod-is-admin", { name: target.name }));
      return;
    }

    await db.removeConnectionRole(target.id, connection.id);
    await ctx.reply(ctx.t("connect.unmod-success", { name: target.name }));

    log(ctx.api, connection.logs_id, {
        type: "role.removed",
        targetName: target.name,
        byName: userName(ctx.from!),
      }, {
        get: () => db.getConnectionConfig(connection.id).then(cfg => cfg.log_excluded_events)
      });
  }
)

// Reset all roles for the connection; only the group owner may run this
groupFeature.command(
  "resetroles",
  logHandle("command-resetroles"),
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (!await validateUser(userId, ctx, "resetroles"))
      return;
    await TryDeleteMessage(ctx);

    const connection = await db.getConnectionBySubmitId(ctx.chat.id);
    if (!connection) { await ctx.reply(ctx.t("connect.not-connected")); return; }
    await executeResetRoles(ctx, userId, connection.id, connection.logs_id);
  },
)

// PM variant: uses the active session connection and verifies creator status in that group
privateFeature.command(
  "resetroles",
  logHandle("command-resetroles-pm"),
  async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const connection = ctx.session.connection;
    if (!connection) {
      await ctx.reply(ctx.t("connect.not-connected"));
      return;
    }

    const member = await ctx.api.getChatMember(connection.submitId, userId);
    if (member.status !== "creator") {
      await ctx.reply(ctx.t("connect.not-admin"));
      return;
    }

    await executeResetRoles(ctx, userId, connection.id, connection.logsId);
  },
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
      await ctx.reply(ctx.t("connect.invalid-message"));
      return;
    }

    const submitId = Number(match[1]);
    const originalMsgId = Number(match[2]);
    const initiatorId = Number(match[3]);
    const broadcastId = ctx.chat.id;
    const connectionId = await db.createConnection(broadcastId, submitId);

    if (connectionId === null) {
      await ctx.reply(ctx.t("connect.already-exists"));
      return;
    }

    await db.coerceUser(initiatorId);
    await db.assignConnectionRole(initiatorId, connectionId, "admin");

    await Promise.all([
      ctx.deleteMessage(),
      ctx.api.deleteMessage(submitId, originalMsgId),
      ctx.api.sendMessage(submitId, ctx.t("connect.success")),
    ]);
    // logs_id is always null for a brand-new connection; kept for completeness
    const newConn = await db.getConnectionBySubmitId(submitId);
    log(ctx.api, newConn?.logs_id, {
      type: "connection.created",
      broadcastId,
      submitId,
    }, {
      get: () => db.getConnectionConfig(newConn!.id).then(cfg => cfg.log_excluded_events)
    });
  }
)

export { composer as connectionFeature }
