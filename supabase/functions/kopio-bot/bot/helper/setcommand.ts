import type { LanguageCode } from "grammy/types"
import type { CommandContext } from "grammy"
import type { Context } from "../context.ts"
import {
  getGroupChatCommands,
  getLanguageCommand,
  getPrivateChatAdminCommands,
  getPrivateChatCommands,
} from "./bot_commands.ts"

import i18n, { isMultipleLocales } from "../i18n.ts"
import { config } from "../../config.ts"

export async function setCommandsHandler(ctx: CommandContext<Context>) {
  const DEFAULT_LANGUAGE_CODE = "en"

  // set private chat commands
  await ctx.api.setMyCommands(
    [
      ...getPrivateChatCommands(DEFAULT_LANGUAGE_CODE),
      ...(isMultipleLocales ? [getLanguageCommand(DEFAULT_LANGUAGE_CODE)] : []),
    ],
    {
      scope: {
        type: "all_private_chats",
      },
    },
  )

  if (isMultipleLocales) {
    const requests = i18n.locales.map(code =>
      ctx.api.setMyCommands([...getPrivateChatCommands(code), ...[getLanguageCommand(code)]], {
        language_code: code as LanguageCode,
        scope: {
          type: "all_private_chats",
        },
      }),
    )

    await Promise.all(requests)
  }

  // set group chat commands
  await ctx.api.setMyCommands(getGroupChatCommands(DEFAULT_LANGUAGE_CODE), {
    scope: {
      type: "all_group_chats",
    },
  })

  if (isMultipleLocales) {
    const requests = i18n.locales.map(code =>
      ctx.api.setMyCommands(getGroupChatCommands(code), {
        language_code: code as LanguageCode,
        scope: {
          type: "all_group_chats",
        },
      }),
    )

    await Promise.all(requests)
  }

  // set private chat commands for owner
  await ctx.api.setMyCommands(
    [
      ...getPrivateChatAdminCommands(DEFAULT_LANGUAGE_CODE),
      ...(isMultipleLocales ? [getLanguageCommand(DEFAULT_LANGUAGE_CODE)] : []),
    ],
    {
      scope: {
        type: "chat",
        chat_id: Number(config.BOT_OWNER_ID),
      },
    },
  )

  return ctx.reply(ctx.t("admin.commands-updated"))
}