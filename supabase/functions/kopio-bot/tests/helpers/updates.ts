import type { Update } from "grammy/types";

let _updateId = 0;
const nextId = () => ++_updateId;

export function groupCommand(opts: {
  chatId: number;
  userId: number;
  command: string;
  messageId?: number;
}): Update {
  const { chatId, userId, command, messageId = nextId() } = opts;
  return {
    update_id: nextId(),
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "supergroup", title: "Test Group" },
      from: { id: userId, is_bot: false, first_name: "Tester" },
      text: `/${command}`,
      entities: [{ type: "bot_command", offset: 0, length: command.length + 1 }],
    },
  };
}

export function privateCommand(opts: {
  userId: number;
  command: string;
  payload?: string;
  messageId?: number;
  first_name?: string;
}): Update {
  const { userId, command, payload, messageId = nextId() } = opts;
  const first_name = opts.first_name ?? "Tester"
  const text = payload ? `/${command} ${payload}` : `/${command}`;
  const cmdLen = command.length + 1; // includes the slash
  return {
    update_id: nextId(),
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: "private", first_name: first_name },
      from: { id: userId, is_bot: false, first_name: first_name },
      text,
      entities: [{ type: "bot_command", offset: 0, length: cmdLen }],
    },
  };
}

export function channelPostForwarded(opts: {
  chatId: number;
  text: string;
  fromBotId: number;
  messageId?: number;
}): Update {
  const { chatId, text, fromBotId, messageId = nextId() } = opts;
  return {
    update_id: nextId(),
    channel_post: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "channel", title: "Test Channel" },
      text,
      forward_origin: {
        type: "user",
        date: Math.floor(Date.now() / 1000),
        sender_user: { id: fromBotId, is_bot: true, first_name: "TestBot" },
      },
    },
  };
}

export function channelPost(opts: {
  chatId: number;
  text: string;
  messageId?: number;
}): Update {
  const { chatId, text, messageId = nextId() } = opts;
  return {
    update_id: nextId(),
    channel_post: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "channel", title: "Test Channel" },
      text,
    },
  };
}

export function privateMessage(opts: {
  userId: number;
  text: string;
  messageId?: number;
}): Update {
  const { userId, text, messageId = nextId() } = opts;
  return {
    update_id: nextId(),
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: "private", first_name: "Tester" },
      from: { id: userId, is_bot: false, first_name: "Tester" },
      text,
    },
  };
}

export function forwardedUserMessage(opts: {
  userId: number;
  forwardedFromId: number;
  forwardedFromName?: string;
  messageId?: number;
}): Update {
  const { userId, forwardedFromId, forwardedFromName = "Forwarded", messageId = nextId() } = opts;
  return {
    update_id: nextId(),
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: "private", first_name: "Tester" },
      from: { id: userId, is_bot: false, first_name: "Tester" },
      text: "forwarded",
      forward_origin: {
        type: "user",
        date: Math.floor(Date.now() / 1000),
        sender_user: { id: forwardedFromId, is_bot: false, first_name: forwardedFromName },
      },
    },
  };
}

export function forwardedHiddenMessage(opts: {
  userId: number;
  messageId?: number;
}): Update {
  const { userId, messageId = nextId() } = opts;
  return {
    update_id: nextId(),
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: "private", first_name: "Tester" },
      from: { id: userId, is_bot: false, first_name: "Tester" },
      text: "forwarded",
      forward_origin: {
        type: "hidden_user",
        date: Math.floor(Date.now() / 1000),
        sender_user_name: "Anonymous",
      },
    },
  };
}

export function callbackQuery(opts: {
  userId: number;
  chatId: number;
  data: string;
  messageId?: number;
}): Update {
  const { userId, chatId, data, messageId = nextId() } = opts;
  return {
    update_id: nextId(),
    callback_query: {
      id: String(nextId()),
      from: { id: userId, is_bot: false, first_name: "Tester" },
      data,
      chat_instance: "test",
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private", first_name: "Tester" },
        from: { id: userId, is_bot: false, first_name: "Tester" },
        text: "confirm prompt",
      },
    },
  };
}
