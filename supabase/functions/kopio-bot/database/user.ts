import { logger } from "../logger.ts";
import { pool } from "./pool.ts";
import { encryptUserId } from "./crypto.ts";


/**
 * Get a user by Telegram user ID, creating them if they do not exist.
 */
export async function coerceUser(userId: number) {
  const conn = await pool.connect();
  try {
    await conn.queryObject`
      INSERT INTO users (id)
      VALUES (${userId})
      ON CONFLICT (id) DO NOTHING
    `;
    logger.trace({ msg: "db.coerceUser", userId });
  } catch (error) {
    logger.error({ msg: "db.coerceUser failed", userId, error });
  } finally {
    conn.release();
  }
}

/**
 * Count a user's submissions, broken down by status.
 */
export async function getUserSubmissionStats(userId: number): Promise<{ total: number; approved: number; pending: number }> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ total: string; approved: string; pending: string }>({
      text: `
        SELECT
          COUNT(*)::text                                                                               AS total,
          COUNT(*) FILTER (WHERE reviewed_by IS NOT NULL AND is_rejected = FALSE)::text               AS approved,
          COUNT(*) FILTER (WHERE reviewed_by IS NULL AND is_rejected = FALSE AND posted_at IS NULL)::text AS pending
        FROM submissions
        WHERE created_by = $1
      `,
      args: [await encryptUserId(userId)],
    });
    const row = rows[0];
    return {
      total:    Number(row?.total    ?? 0),
      approved: Number(row?.approved ?? 0),
      pending:  Number(row?.pending  ?? 0),
    };
  } catch (error) {
    logger.error({ msg: "db.getUserSubmissionStats failed", userId, error });
    return { total: 0, approved: 0, pending: 0 };
  } finally {
    conn.release();
  }
}

/**
 * Remove user attribution from all of a user's submissions (set created_by = NULL).
 * Returns the number of rows updated.
 */
export async function anonymizeUserSubmissions(userId: number): Promise<number> {
  const conn = await pool.connect();
  try {
    const { rowCount } = await conn.queryObject({
      text: `UPDATE submissions SET created_by = NULL WHERE created_by = $1`,
      args: [await encryptUserId(userId)],
    });
    logger.trace({ msg: "db.anonymizeUserSubmissions", userId, count: rowCount });
    return rowCount ?? 0;
  } catch (error) {
    logger.error({ msg: "db.anonymizeUserSubmissions failed", userId, error });
    return 0;
  } finally {
    conn.release();
  }
}

/**
 * Delete all stored data for a user:
 * - anonymises their submissions
 * - removes their user record and connection roles (cascade)
 * - deletes their bot session from storage
 */
export async function deleteUserData(userId: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({ text: `UPDATE submissions SET created_by = NULL WHERE created_by = $1`, args: [await encryptUserId(userId)] });
    await conn.queryObject`DELETE FROM users WHERE id = ${userId}`;
    // session key for private chats equals the user/chat id
    await conn.queryObject({ text: `DELETE FROM bot_sessions WHERE key = $1`,         args: [String(userId)] });
    await conn.queryObject({ text: `DELETE FROM bot_conversations WHERE key LIKE $1`, args: [`${userId}%`] });
    logger.trace({ msg: "db.deleteUserData", userId });
  } catch (error) {
    logger.error({ msg: "db.deleteUserData failed", userId, error });
  } finally {
    conn.release();
  }
}