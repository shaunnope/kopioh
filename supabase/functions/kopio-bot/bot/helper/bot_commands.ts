import type { BotCommand } from "grammy/types"
import i18n from "../i18n.ts"
import { logger } from "../../logger.ts";
import { TranslateFunction } from "grammy_i18n";
import { FormattedString } from "grammy_parse_mode";

export const DEFAULT_LANGUAGE_CODE = "en"

if (!i18n.locales.includes(DEFAULT_LANGUAGE_CODE)) {
  logger.warn(`Localization for default language code (${DEFAULT_LANGUAGE_CODE}) is missing`)
}

const ALL_COMMANDS = new Map<string, BotCommand>(
  Object.entries({
    start: {
      command: "start",
      description: "commands.start",
    },
    submit: {
      command: "submit",
      description: "commands.submit",
    },
    help: {
      command: "help",
      description: "commands.help",
    },
    language: {
      command: "language",
      description: "commands.language",
    },
    stats: {
      command: "stats",
      description: "commands.stats",
    },
    setcommands: {
      command: "setcommands",
      description: "commands.setcommands",
    },
    admin: {
      command: "admin",
      description: "commands.admin",
    },
    ping: {
      command: "ping",
      description: "commands.ping",
    },
    connect: {
      command: "connect",
      description: "commands.connect",
    },
    disconnect: {
      command: "disconnect",
      description: "commands.disconnect",
    },
    mod: {
      command: "mod",
      description: "commands.mod",
    },
    unmod: {
      command: "unmod",
      description: "commands.unmod",
    },
    resetroles: {
      command: "resetroles",
      description: "commands.resetroles",
    },
    settemplate: {
      command: "settemplate",
      description: "commands.settemplate",
    },
  }),
)

function getCommand(key: string, localeCode: string = DEFAULT_LANGUAGE_CODE): BotCommand {
  const command = ALL_COMMANDS.get(key)
  if (command === undefined) {
    return {
      command: key,
      description: i18n.t(localeCode, "commands.unknown"),
    }
  }
  return {
    command: command.command,
    description: i18n.t(localeCode, command.description),
  }
}

function getGlobalChatCommands(localeCode: string): BotCommand[] {
  return [
    getCommand("start", localeCode),
    getCommand("help", localeCode),
    getCommand("ping", localeCode),
  ]
}

export function getPrivateChatCommands(localeCode: string): BotCommand[] {
  return [...getGlobalChatCommands(localeCode), getCommand("submit", localeCode)]
}

export function getPrivateChatAdminCommands(localeCode: string): BotCommand[] {
  return [...getPrivateChatCommands(localeCode), getCommand("settemplate", localeCode), getCommand("setcommands", localeCode)]
}

export function getGroupChatCommands(localeCode: string): BotCommand[] {
  return [
    getCommand("start", localeCode),
    getCommand("help", localeCode),
  ]
}

export function getGroupChatAdminCommands(localeCode: string): BotCommand[] {
  return [
    getCommand("connect", localeCode),
    getCommand("disconnect", localeCode),
    getCommand("mod", localeCode),
    getCommand("unmod", localeCode),
    getCommand("resetroles", localeCode),
  ]
}

export function getLanguageCommand(localeCode: string): BotCommand {
  return getCommand("language", localeCode)
}

export function getCommandEntries(...commands: BotCommand[]) {
  return commands.map(c => `/${c.command} - ${c.description}`).join("\n")
}

export function getPrivateChatCommandEntries(localeCode: string = DEFAULT_LANGUAGE_CODE) {
  return getCommandEntries(...getPrivateChatCommands(localeCode))
}


export function formatCommandUsage(t: TranslateFunction, command: string, required?: string[], optional?: string[]) {
  let usage = FormattedString.code(`/${command}`)
  required?.forEach(req => {
    usage = usage.code(" <").code(t(`command-${command}.arg-${req}`)).code(">")
  });
  optional?.forEach(opt => {
    usage = usage.code(" [").code(t(`command-${command}.arg-${opt}`)).code("]")
  })

  return FormattedString.b(`${t("command-help.usage")}: `).concat(usage)
}

export function formatCommandUsageV2(t: TranslateFunction, command: string) {
  return FormattedString.b(`${t("command-help.usage")}: `).code(t(`command-${command}.usage`))
}