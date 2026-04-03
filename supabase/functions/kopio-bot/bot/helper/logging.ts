import { Middleware } from "https://deno.land/x/grammy@v1.42.0/mod.ts";

import _ from "lodash"

import { type Context } from "../context.ts";
import { logger } from "../../logger.ts";

export function getChatInfo(ctx: Context) {
  if (_.isNil(ctx.chat))
    return {}

  return {
      chat: _.pick(ctx.chat, ["id", "type"]),
    }
}

export function getSenderInfo(ctx: Context) {
  if (!_.isNil(ctx.senderChat)) {
    return {
      sender: _.pick(ctx.senderChat, ["id", "type"]),
    }
  }

  if (!_.isNil(ctx.from)) {
    return {
      sender: _.pick(ctx.from, ["id"]),
    }
  }

  return {}
}

export function getMetadata(ctx: Context) {
  return {
    message_id: ctx.msg?.message_id,
    ...getChatInfo(ctx),
    ...getSenderInfo(ctx),
  }
}

export function getFullMetadata(ctx: Context) {
  return {
    ...ctx.update,
  }
}

export function logHandle(id: string, full?: true): Middleware<Context> {
  return (ctx, next) => {
    // TODO: metrics logging

    logger.debug({
      msg: `handle ${id}`,
      ...(id === "unhandled" || full ? getFullMetadata(ctx) : getMetadata(ctx)),
    })

    return next()
  }
}