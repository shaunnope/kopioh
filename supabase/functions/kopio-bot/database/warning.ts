import { logger } from "../logger.ts";
import { pool } from "./pool.ts";

export const WARN_THRESHOLD_TEMP = 3;
export const WARN_THRESHOLD_PERM = 5;
export const TEMP_BAN_DAYS = 7;

export type WarnThresholds = {
  warnThresholdTemp: number;
  warnThresholdPerm: number;
  tempBanDays: number;
};

export type WarnResult = {
  count: number;
  banned: boolean;
  permanent: boolean;
  expiresAt: Date | null;
};

export async function issueWarning(
  userId: number,
  broadcastId: number,
  submissionId: string | null,
  reason: string | null = null,
  thresholds?: WarnThresholds,
): Promise<WarnResult> {
  const threshTemp = thresholds?.warnThresholdTemp ?? WARN_THRESHOLD_TEMP;
  const threshPerm = thresholds?.warnThresholdPerm ?? WARN_THRESHOLD_PERM;
  const banDays = thresholds?.tempBanDays ?? TEMP_BAN_DAYS;

  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `INSERT INTO warnings (user_id, broadcast_id, submission_id, reason) VALUES ($1, $2, $3, $4)`,
      args: [userId, broadcastId, submissionId, reason],
    });

    const { rows: countRows } = await conn.queryObject<{ count: string }>({
      text: `SELECT COUNT(*)::text AS count FROM warnings WHERE user_id = $1 AND broadcast_id = $2`,
      args: [userId, broadcastId],
    });
    const count = Number(countRows[0].count);

    let banned = false;
    let permanent = false;
    let expiresAt: Date | null = null;

    if (count >= threshPerm) {
      await conn.queryObject({
        text: `
          INSERT INTO bans (user_id, broadcast_id, expires_at)
          VALUES ($1, $2, NULL)
          ON CONFLICT (user_id, broadcast_id) DO UPDATE SET expires_at = NULL, created_at = NOW()
        `,
        args: [userId, broadcastId],
      });
      banned = true;
      permanent = true;
    } else if (count >= threshTemp) {
      expiresAt = new Date(Date.now() + banDays * 24 * 60 * 60 * 1000);
      await conn.queryObject({
        text: `
          INSERT INTO bans (user_id, broadcast_id, expires_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, broadcast_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, created_at = NOW()
        `,
        args: [userId, broadcastId, expiresAt.toISOString()],
      });
      banned = true;
    }

    logger.trace({ msg: "db.issueWarning", userId, broadcastId, count, banned, permanent });
    return { count, banned, permanent, expiresAt };
  } catch (error) {
    logger.error({ msg: "db.issueWarning failed", userId, broadcastId, error });
    return { count: 0, banned: false, permanent: false, expiresAt: null };
  } finally {
    conn.release();
  }
}

export async function getUserWarningCount(userId: number, broadcastId: number): Promise<number> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ count: string }>({
      text: `SELECT COUNT(*)::text AS count FROM warnings WHERE user_id = $1 AND broadcast_id = $2`,
      args: [userId, broadcastId],
    });
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    logger.error({ msg: "db.getUserWarningCount failed", userId, broadcastId, error });
    return 0;
  } finally {
    conn.release();
  }
}

export async function isUserBanned(userId: number, broadcastId: number): Promise<boolean> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject({
      text: `
        SELECT 1 FROM bans
        WHERE user_id = $1 AND broadcast_id = $2
          AND (expires_at IS NULL OR expires_at > NOW())
      `,
      args: [userId, broadcastId],
    });
    return rows.length > 0;
  } catch (error) {
    logger.error({ msg: "db.isUserBanned failed", userId, broadcastId, error });
    return false;
  } finally {
    conn.release();
  }
}

export async function getBanStatus(
  userId: number,
  broadcastId: number,
): Promise<{ expiresAt: Date | null } | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ expires_at: string | null }>({
      text: `
        SELECT expires_at FROM bans
        WHERE user_id = $1 AND broadcast_id = $2
          AND (expires_at IS NULL OR expires_at > NOW())
      `,
      args: [userId, broadcastId],
    });
    if (!rows[0]) return null;
    return { expiresAt: rows[0].expires_at ? new Date(rows[0].expires_at) : null };
  } catch (error) {
    logger.error({ msg: "db.getBanStatus failed", userId, broadcastId, error });
    return null;
  } finally {
    conn.release();
  }
}

export async function liftBan(userId: number, broadcastId: number): Promise<boolean> {
  const conn = await pool.connect();
  try {
    const { rowCount } = await conn.queryObject({
      text: `DELETE FROM bans WHERE user_id = $1 AND broadcast_id = $2`,
      args: [userId, broadcastId],
    });
    logger.trace({ msg: "db.liftBan", userId, broadcastId, deleted: (rowCount ?? 0) > 0 });
    return (rowCount ?? 0) > 0;
  } catch (error) {
    logger.error({ msg: "db.liftBan failed", userId, broadcastId, error });
    return false;
  } finally {
    conn.release();
  }
}

/**
 * Remove the N most-recent warnings for a user in a broadcast.
 * If `count` is omitted, all warnings are removed.
 * Returns the number of rows deleted.
 */
export async function removeWarnings(
  userId: number,
  broadcastId: number,
  count?: number,
): Promise<number> {
  const conn = await pool.connect();
  try {
    let rowCount: number;
    if (count === undefined) {
      const result = await conn.queryObject({
        text: `DELETE FROM warnings WHERE user_id = $1 AND broadcast_id = $2`,
        args: [userId, broadcastId],
      });
      rowCount = result.rowCount ?? 0;
    } else {
      const result = await conn.queryObject({
        text: `
          DELETE FROM warnings
          WHERE id IN (
            SELECT id FROM warnings
            WHERE user_id = $1 AND broadcast_id = $2
            ORDER BY created_at DESC
            LIMIT $3
          )
        `,
        args: [userId, broadcastId, count],
      });
      rowCount = result.rowCount ?? 0;
    }
    logger.trace({ msg: "db.removeWarnings", userId, broadcastId, count, removed: rowCount });
    return rowCount;
  } catch (error) {
    logger.error({ msg: "db.removeWarnings failed", userId, broadcastId, error });
    return 0;
  } finally {
    conn.release();
  }
}
