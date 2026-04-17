import { BaseContext } from "../context.ts";
import { ConnectionInfo } from "../session.ts";

/**
 * Checks if connection is defined. If null or undefined, sends a response and returns false.
 * Otherwise, returns true.
 * @param ctx 
 * @param connection 
 * @param key The locale key used for the response message sent on failure
 * @returns 
 */
export async function isConnected(
  ctx: BaseContext, 
  connection?: ConnectionInfo | null, 
  key: string = "connect.no-connection") {
  if (!connection) {
    await ctx.reply(ctx.t(key));
    return false;
  }
  return true;
}