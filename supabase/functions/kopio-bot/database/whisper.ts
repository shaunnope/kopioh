import { logger } from "../logger.ts";
import { pool } from "./pool.ts";

/**
 * Check whether a user is under their whisper rate limit.
 * Returns true if they can whisper, false if the limit is reached.
 */
export async function canWhisper(
  userId: number,
  submitId: number,
  limit: number,
  periodMinutes: number,
): Promise<boolean> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ count: string }>({
      text: `
        SELECT COUNT(*)::text AS count
        FROM whispers
        WHERE created_by = $1
          AND submit_id  = $2
          AND created_at > NOW() - INTERVAL '1 minute' * $3
      `,
      args: [userId, submitId, periodMinutes],
    });
    const used = Number(rows[0]?.count ?? 0);
    logger.trace({ msg: "db.canWhisper", userId, submitId, used, limit });
    return used < limit;
  } catch (error) {
    logger.error({ msg: "db.canWhisper failed", userId, submitId, error });
    return false;
  } finally {
    conn.release();
  }
}

/**
 * Record a whisper. Call after the message has been sent to the group.
 */
export async function createWhisper(userId: number, submitId: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `INSERT INTO whispers (submit_id, created_by) VALUES ($1, $2)`,
      args: [submitId, userId],
    });
    logger.trace({ msg: "db.createWhisper", userId, submitId });
  } catch (error) {
    logger.error({ msg: "db.createWhisper failed", userId, submitId, error });
  } finally {
    conn.release();
  }
}
