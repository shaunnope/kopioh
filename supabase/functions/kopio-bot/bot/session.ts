import {
  SessionFlavor as DefaultSessionFlavor,
} from "grammy";

export interface SessionData {
  /**
   * Broadcast channel ID passed in from a deep-link /start.
   * Set before entering the submit conversation, cleared once read.
   */
  pendingBroadcastId: number | null;
}

export type SessionFlavor = DefaultSessionFlavor<SessionData>;

export function initial(): SessionData {
  return { pendingBroadcastId: null };
}
