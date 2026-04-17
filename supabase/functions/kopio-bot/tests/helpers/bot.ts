import { MemorySessionStorage, type NextFunction, type RawApi, type Transformer } from "grammy";
import type { SessionData } from "../../bot/session.ts";
import type { Update, UserFromGetMe as BotInfo } from "grammy/types";
import { getBot } from "../../bot/index.ts";
import { ConversationContext } from "../../bot/context.ts";

export const BOT_ID = 999;
export const BOT_USERNAME = "testbot";

const TEST_BOT_INFO: BotInfo = {
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
 * The transformer used for mocking Bot API calls during unit tests. 
 * Used to create the mock bot and augmenting conversations under test
 * @param botInfo 
 * @param calls 
 * @param overrides 
 * @returns 
 */
// deno-lint-ignore no-explicit-any
export function createTestTransformer(botInfo: BotInfo, calls: ApiCall[], overrides: Record<string, any>): Transformer<RawApi> {
  return (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> })

    if (method in overrides)
      return Promise.resolve({ ok: true, result: overrides[method] })

    // deno-lint-ignore no-explicit-any
    const p = payload as any;

    switch (method) {
      case "getMe":
        return Promise.resolve({ ok: true, result: botInfo })

      case "sendMessage": {
        const isPrivate = (p.chat_id as number) > 0;
        return Promise.resolve({
          ok: true,
          result: {
            message_id: 100 + calls.length,
            date: 0,
            chat: isPrivate
              ? { id: p.chat_id, type: "private", first_name: "Tester" }
              : { id: p.chat_id, type: "supergroup", title: "Test Group" },
            from: { id: botInfo.id, is_bot: true, first_name: "TestBot", username: botInfo.username },
            text: p.text ?? "",
          },
        })
      }

      case "sendPoll": {
        const isPrivate = (p.chat_id as number) > 0;
        return Promise.resolve({
          ok: true,
          result: {
            message_id: 100 + calls.length,
            date: 0,
            chat: isPrivate
              ? { id: p.chat_id, type: "private", first_name: "Tester" }
              : { id: p.chat_id, type: "supergroup", title: "Test Group" },
            from: { id: botInfo.id, is_bot: true, first_name: "TestBot", username: botInfo.username },
            poll: {
              id: `poll-${calls.length}`,
              question: p.question ?? "",
              options: (p.options as string[]).map((text, i) => ({ text, voter_count: 0, id: String(i) })),
              total_voter_count: 0,
              is_closed: false,
              is_anonymous: p.is_anonymous ?? true,
              type: p.type ?? "regular",
              allows_multiple_answers: p.allows_multiple_answers ?? false,
            },
          },
        })
      }

      case "sendPhoto": {
        const isPrivate = (p.chat_id as number) > 0;
        return Promise.resolve({
          ok: true,
          result: {
            message_id: 100 + calls.length,
            date: 0,
            chat: isPrivate
              ? { id: p.chat_id, type: "private", first_name: "Tester" }
              : { id: p.chat_id, type: "supergroup", title: "Test Group" },
            from: { id: botInfo.id, is_bot: true, first_name: "TestBot", username: botInfo.username },
            photo: [{ file_id: "photo_file_id", file_unique_id: "photo_unique_id", width: 800, height: 600, file_size: 12345 }],
            caption: p.caption ?? "",
          },
        })
      }

      case "sendVideo": {
        const isPrivate = (p.chat_id as number) > 0;
        return Promise.resolve({
          ok: true,
          result: {
            message_id: 100 + calls.length,
            date: 0,
            chat: isPrivate
              ? { id: p.chat_id, type: "private", first_name: "Tester" }
              : { id: p.chat_id, type: "supergroup", title: "Test Group" },
            from: { id: botInfo.id, is_bot: true, first_name: "TestBot", username: botInfo.username },
            video: { file_id: "video_file_id", file_unique_id: "video_unique_id", width: 1280, height: 720, duration: 0, mime_type: "video/mp4" },
            caption: p.caption ?? "",
          },
        })
      }

      case "editMessageText":
      case "editMessageReplyMarkup":
      case "deleteMessage":
      case "answerCallbackQuery":
        return Promise.resolve({ ok: true, result: true })

      case "getChat":
        return Promise.resolve({
          ok: true,
          result: overrides.chatInfo ?? { id: p.chat_id, type: "supergroup", title: "Test Group" }
        })

      case "getChatMember":
        return Promise.resolve({
          ok: true,
          result: {
            status: overrides.memberStatus ?? "creator",
            user: { id: p.user_id, is_bot: false, first_name: "Test" },
          }
        })

      default:
        throw new Error(`Unmocked Telegram API method: ${method}`)
    }
  }
}

/**
 * Creates a bot instance with a mocked Telegram API.
 * `calls` accumulates every outgoing API call.
 * `overrides` lets individual tests control specific method responses.
 */
 // deno-lint-ignore no-explicit-any
export function createTestBot(botInfo: BotInfo = TEST_BOT_INFO, overrides: Record<string, any> | null = null) {
  overrides ??= {}
  const calls: ApiCall[] = []
  
  const transformer = createTestTransformer(botInfo, calls, overrides)
  
  const bot = getBot({
    botInfo,
    sessionStorage: new MemorySessionStorage<SessionData>(),
    conversationStorage: new MemorySessionStorage(),
    transformer
  })

  return {
    bot,
    calls,
    overrides,
    clearCalls: () => calls.splice(0),
    handleUpdate: (update: Update) => bot.handleUpdate(update),
    convoPlugin: async (ctx: ConversationContext, next: NextFunction) => {
    ctx.api.config.use(transformer);
    await next();
    }
  }
}