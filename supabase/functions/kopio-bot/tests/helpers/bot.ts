import type { Update } from "https://deno.land/x/grammy@v1.42.0/types.ts";
import { getBot } from "../../bot/index.ts";

export const BOT_ID = 999;
export const BOT_USERNAME = "testbot";

const TEST_BOT_INFO = {
  id: BOT_ID,
  is_bot: true as const,
  first_name: "TestBot",
  username: BOT_USERNAME,
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_manage_bots: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
};

export type ApiCall = { method: string; payload: Record<string, unknown> };

/**
 * Creates a bot instance with a mocked Telegram API.
 * `calls` accumulates every outgoing API call.
 * `overrides` lets individual tests control specific method responses.
 */
export function createTestBot() {
  const bot = getBot();
  bot.botInfo = TEST_BOT_INFO;
  const calls: ApiCall[] = [];
  // deno-lint-ignore no-explicit-any
  const overrides: Record<string, any> = {};

  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });

    if (method in overrides) {
      // deno-lint-ignore no-explicit-any
      return Promise.resolve({ ok: true, result: overrides[method] } as any);
    }

    // deno-lint-ignore no-explicit-any
    const p = payload as any;

    switch (method) {
      case "getMe":
        // deno-lint-ignore no-explicit-any
        return Promise.resolve({ ok: true, result: TEST_BOT_INFO } as any);

      case "sendMessage":
        return Promise.resolve({
          ok: true,
          result: {
            message_id: 100 + calls.length,
            chat: { id: p.chat_id, type: "supergroup" },
            date: 0,
            text: p.text ?? "",
          },
          // deno-lint-ignore no-explicit-any
        } as any);

      case "editMessageText":
        // deno-lint-ignore no-explicit-any
        return Promise.resolve({ ok: true, result: true } as any);

      case "deleteMessage":
        // deno-lint-ignore no-explicit-any
        return Promise.resolve({ ok: true, result: true } as any);

      case "getChatMember":
        return Promise.resolve({
          ok: true,
          result: {
            status: overrides.memberStatus ?? "creator",
            user: { id: p.user_id, is_bot: false, first_name: "Test" },
          },
          // deno-lint-ignore no-explicit-any
        } as any);

      default:
        throw new Error(`Unmocked Telegram API method: ${method}`);
    }
  });

  return {
    bot,
    calls,
    overrides,
    clearCalls: () => calls.splice(0),
    handleUpdate: (update: Update) => bot.handleUpdate(update),
  };
}