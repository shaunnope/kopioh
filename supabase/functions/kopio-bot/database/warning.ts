import { logger } from "../logger.ts";
import { pool } from "./pool.ts";
import { encryptSubmissionId } from "./crypto.ts";

export const WARN_THRESHOLD_TEMP = 3;
export const TEMP_BAN_DAYS = 7;

export type WarnThresholds = {
  warnThresholdTemp: number;
  tempBanDays: number;
};

export type WarnResult = {
  warningId: string;
  count: number;
  banned: boolean;
  permanent: boolean;
  expiresAt: Date | null;
};

export type Appeal = {
  id: string;
  warningId: string;
  userId: number;
  broadcastId: number;
  reason: string;
  warningReason: string | null;
  status: "pending" | "lifted" | "rejected";
  rejectionReason: string | null;
  createdAt: Date;
};

export async function issueWarning(
  userId: number,
  broadcastId: number,
  submissionId: string | null,
  reason: string | null = null,
  thresholds?: WarnThresholds,
): Promise<WarnResult> {
  const threshTemp = thresholds?.warnThresholdTemp ?? WARN_THRESHOLD_TEMP;
  const banDays = thresholds?.tempBanDays ?? TEMP_BAN_DAYS;

  const conn = await pool.connect();
  try {
    const encryptedSubmissionId = submissionId ? await encryptSubmissionId(submissionId) : null;
    const { rows: insertRows } = await conn.queryObject<{ id: string }>({
      text: `INSERT INTO warnings (user_id, broadcast_id, submission_id, reason) VALUES ($1, $2, $3, $4) RETURNING id`,
      args: [userId, broadcastId, encryptedSubmissionId, reason],
    });
    const warningId = insertRows[0].id;

    const { rows: countRows } = await conn.queryObject<{ count: string }>({
      text: `SELECT COUNT(*)::text AS count FROM warnings WHERE user_id = $1 AND broadcast_id = $2`,
      args: [userId, broadcastId],
    });
    const count = Number(countRows[0].count);

    let banned = false;
    let expiresAt: Date | null = null;

    if (count >= threshTemp) {
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

    logger.trace({ msg: "db.issueWarning", userId, broadcastId, count, banned, warningId });
    return { warningId, count, banned, permanent: false, expiresAt };
  } catch (error) {
    logger.error({ msg: "db.issueWarning failed", userId, broadcastId, error });
    return { warningId: "", count: 0, banned: false, permanent: false, expiresAt: null };
  } finally {
    conn.release();
  }
}

export type WarningDetail = {
  id: string;
  reason: string | null;
  createdAt: Date;
  appealStatus: "none" | "pending" | "lifted" | "rejected";
  rejectionReason: string | null;
};

export async function getWarningDetails(
  userId: number,
  broadcastId: number,
): Promise<WarningDetail[]> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{
      id: string;
      reason: string | null;
      created_at: string;
      appeal_at: string | null;
      appeal_processed_at: string | null;
      appeal_rejection: string | null;
    }>({
      text: `
        SELECT id, reason, created_at, appeal_at, appeal_processed_at, appeal_rejection
        FROM warnings
        WHERE user_id = $1 AND broadcast_id = $2
        ORDER BY created_at ASC
      `,
      args: [userId, broadcastId],
    });
    return rows.map(r => {
      const appealStatus: WarningDetail["appealStatus"] = r.appeal_at === null
        ? "none"
        : r.appeal_processed_at === null
        ? "pending"
        : r.appeal_rejection === null ? "lifted" : "rejected";
      return { id: r.id, reason: r.reason, createdAt: new Date(r.created_at), appealStatus, rejectionReason: r.appeal_rejection };
    });
  } catch (error) {
    logger.error({ msg: "db.getWarningDetails failed", userId, broadcastId, error });
    return [];
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
    // Lazily clean up any expired temporary ban and its associated warnings
    const { rowCount } = await conn.queryObject({
      text: `DELETE FROM bans WHERE user_id = $1 AND broadcast_id = $2 AND expires_at IS NOT NULL AND expires_at <= NOW()`,
      args: [userId, broadcastId],
    });
    if ((rowCount ?? 0) > 0) {
      await conn.queryObject({
        text: `DELETE FROM warnings WHERE user_id = $1 AND broadcast_id = $2`,
        args: [userId, broadcastId],
      });
      return false;
    }

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
    if ((rowCount ?? 0) === 0) return false;
    await conn.queryObject({
      text: `DELETE FROM warnings WHERE user_id = $1 AND broadcast_id = $2`,
      args: [userId, broadcastId],
    });
    logger.trace({ msg: "db.liftBan", userId, broadcastId });
    return true;
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

export async function createAppeal(
  warningId: string,
  userId: number,
  reason: string,
): Promise<string | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ id: string }>({
      text: `
        UPDATE warnings
        SET appeal_at = NOW(), appeal_reason = $3
        WHERE id = $1 AND user_id = $2 AND appeal_at IS NULL
        RETURNING id
      `,
      args: [warningId, userId, reason],
    });
    return rows[0]?.id ?? null;
  } catch (error) {
    logger.error({ msg: "db.createAppeal failed", warningId, error });
    return null;
  } finally {
    conn.release();
  }
}

export async function getAppeal(warningId: string): Promise<Appeal | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{
      id: string;
      user_id: string;
      broadcast_id: string;
      reason: string | null;
      appeal_reason: string;
      appeal_at: string;
      appeal_processed_at: string | null;
      appeal_rejection: string | null;
    }>({
      text: `
        SELECT id, user_id, broadcast_id, reason,
               appeal_reason, appeal_at, appeal_processed_at, appeal_rejection
        FROM warnings
        WHERE id = $1 AND appeal_at IS NOT NULL
      `,
      args: [warningId],
    });
    if (!rows[0]) return null;
    const r = rows[0];
    const status: Appeal["status"] = r.appeal_processed_at === null
      ? "pending"
      : r.appeal_rejection === null ? "lifted" : "rejected";
    return {
      id: r.id,
      warningId: r.id,
      userId: Number(r.user_id),
      broadcastId: Number(r.broadcast_id),
      reason: r.appeal_reason,
      warningReason: r.reason,
      status,
      rejectionReason: r.appeal_rejection,
      createdAt: new Date(r.appeal_at),
    };
  } catch (error) {
    logger.error({ msg: "db.getAppeal failed", warningId, error });
    return null;
  } finally {
    conn.release();
  }
}

export async function liftAppeal(
  warningId: string,
): Promise<{ userId: number; broadcastId: number } | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ user_id: string; broadcast_id: string }>({
      text: `SELECT user_id, broadcast_id FROM warnings WHERE id = $1 AND appeal_at IS NOT NULL AND appeal_processed_at IS NULL`,
      args: [warningId],
    });
    if (!rows[0]) return null;

    const userId = Number(rows[0].user_id);
    const broadcastId = Number(rows[0].broadcast_id);

    await conn.queryObject({
      text: `DELETE FROM warnings WHERE user_id = $1 AND broadcast_id = $2`,
      args: [userId, broadcastId],
    });
    await conn.queryObject({
      text: `DELETE FROM bans WHERE user_id = $1 AND broadcast_id = $2`,
      args: [userId, broadcastId],
    });

    logger.trace({ msg: "db.liftAppeal", warningId, userId, broadcastId });
    return { userId, broadcastId };
  } catch (error) {
    logger.error({ msg: "db.liftAppeal failed", warningId, error });
    return null;
  } finally {
    conn.release();
  }
}

export async function rejectAppeal(
  warningId: string,
  rejectionReason: string,
): Promise<{ userId: number } | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ user_id: string }>({
      text: `
        UPDATE warnings
        SET appeal_processed_at = NOW(), appeal_rejection = $2
        WHERE id = $1 AND appeal_at IS NOT NULL AND appeal_processed_at IS NULL
        RETURNING user_id
      `,
      args: [warningId, rejectionReason],
    });
    if (!rows[0]) return null;
    return { userId: Number(rows[0].user_id) };
  } catch (error) {
    logger.error({ msg: "db.rejectAppeal failed", warningId, error });
    return null;
  } finally {
    conn.release();
  }
}
