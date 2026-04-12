import {
  SessionFlavor as DefaultSessionFlavor,
} from "grammy";

export interface SessionData {
  /**
   * Information about the active connection, set in private chats via deep-link /start.
   * Persists until the user uses a different deep-link or runs /disconnect.
   */
  connection: {
    /** UUID of the active connection. Used to check roles */
    id: string
    /** The id of the associated broadcast channel */
    broadcastId: number
    /** The id of the associated submission group */
    submitId: number
  } | null

  /**
   * Metadata about the active connection, such as group name.
   * Stored with a timestamp for periodic invalidation + retrieval
   *
   * Only valid if `connectionMeta.id` == `connection.id`
   */
  connectionMeta: {
    id: string
    /** Title of the associated `submit` group chat */
    title: string
    updated: number
  } | null
}

export type SessionFlavor = DefaultSessionFlavor<SessionData>;

export function initial(): SessionData {
  return { connection: null, connectionMeta: null };
}
