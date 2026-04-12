import { Pool } from "postgres";
import { config } from "../config.ts";
import { logger } from "../logger.ts";
import { toJsonb } from "./serializer.ts";

const { username, password, hostname, port, pathname } = new URL(config.DB_URL);

const pool = new Pool(
  {
    user: username,
    password,
    hostname,
    port: Number(port),
    database: pathname.slice(1),
    tls: { enabled: true, enforce: false },
  },
  3,
  true,
);

/**
 * Get a user by Telegram user ID, creating them if they do not exist.
 */
async function coerceUser(userId: number) {
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
 * Look up a connection by its submit chat ID.
 * Returns the connection row, or null if not found.
 */
async function getConnectionBySubmitId(submitId: number) {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ id: string; broadcast_id: number; submit_id: number }>`
      SELECT id, broadcast_id, submit_id FROM connections WHERE submit_id = ${submitId} LIMIT 1
    `;
    logger.trace({ msg: "db.getConnectionBySubmitId", submitId, found: rows.length > 0 });
    return rows[0] ?? null;
  } catch (error) {
    logger.error({ msg: "db.getConnectionBySubmitId failed", submitId, error });
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Insert a connection between a broadcast channel and a submit chat.
 * Returns the new connection id, or null if it already existed.
 */
async function createConnection(broadcastId: number, submitId: number) {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ id: string }>`
      INSERT INTO connections (broadcast_id, submit_id)
      VALUES (${broadcastId}, ${submitId})
      ON CONFLICT (broadcast_id, submit_id) DO NOTHING
      RETURNING id
    `;
    logger.trace({ msg: "db.createConnection", broadcastId, submitId, created: rows[0]?.id ?? null });
    return rows[0]?.id ?? null;
  } catch (error) {
    logger.error({ msg: "db.createConnection failed", broadcastId, submitId, error });
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Delete the connection for a given submit chat ID.
 * Returns true if a row was deleted, false otherwise.
 */
async function deleteConnection(submitId: number) {
  const conn = await pool.connect();
  try {
    const { rowCount } = await conn.queryObject`
      DELETE FROM connections WHERE submit_id = ${submitId}
    `;
    logger.trace({ msg: "db.deleteConnection", submitId, deleted: (rowCount ?? 0) > 0 });
    return (rowCount ?? 0) > 0;
  } catch (error) {
    logger.error({ msg: "db.deleteConnection failed", submitId, error });
    return false;
  } finally {
    conn.release();
  }
}

/**
 * Insert a new submission and return its UUID, or null on failure.
 */
async function createSubmission(
  broadcastId: number,
  createdBy: number,
  content: unknown,
) {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ id: string }>({
      text: `
        INSERT INTO submissions (broadcast_id, created_by, content)
        VALUES ($1, $2, $3::jsonb)
        RETURNING id
      `,
      args: [broadcastId, createdBy, toJsonb(content)],
    });
    logger.trace({ msg: "db.createSubmission", broadcastId, createdBy, id: rows[0]?.id ?? null });
    return rows[0]?.id ?? null;
  } catch (error) {
    logger.error({ msg: "db.createSubmission failed", broadcastId, createdBy, error });
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Check if a user has admin access for a given connection.
 * Checks both global role (users.role) and per-connection role (connection_roles.role).
 */
async function isUserAdmin(userId: number, connectionId: string): Promise<boolean> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ role: string; global_role: string }>({
      text: `
        SELECT
          COALESCE(cr.role::text, 'user') AS role,
          u.role::text                    AS global_role
        FROM users u
        LEFT JOIN connection_roles cr
          ON cr.user_id = u.id AND cr.connection_id = $2
        WHERE u.id = $1
      `,
      args: [userId, connectionId],
    });
    const row = rows[0];
    if (!row) return false;
    return row.global_role === "admin" || row.role === "admin";
  } catch (error) {
    logger.error({ msg: "db.isUserAdmin failed", userId, connectionId, error });
    return false;
  } finally {
    conn.release();
  }
}

/**
 * Remove a user's connection-scoped role, reverting them to the default 'user' role.
 */
async function removeConnectionRole(userId: number, connectionId: string): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject`
      DELETE FROM connection_roles WHERE user_id = ${userId} AND connection_id = ${connectionId}
    `;
    logger.trace({ msg: "db.removeConnectionRole", userId, connectionId });
  } catch (error) {
    logger.error({ msg: "db.removeConnectionRole failed", userId, connectionId, error });
  } finally {
    conn.release();
  }
}

/**
 * Check if a user has moderator or admin access for a given connection.
 * Checks both global role (users.role) and per-connection role (connection_roles.role).
 */
async function isUserModerator(userId: number, connectionId: string): Promise<boolean> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ role: string; global_role: string }>({
      text: `
        SELECT
          COALESCE(cr.role::text, 'user') AS role,
          u.role::text                    AS global_role
        FROM users u
        LEFT JOIN connection_roles cr
          ON cr.user_id = u.id AND cr.connection_id = $2
        WHERE u.id = $1
      `,
      args: [userId, connectionId],
    });
    const row = rows[0];
    if (!row) return false;
    const isMod = (r: string) => r === "moderator" || r === "admin";
    return isMod(row.global_role) || isMod(row.role);
  } catch (error) {
    logger.error({ msg: "db.isUserModerator failed", userId, connectionId, error });
    return false;
  } finally {
    conn.release();
  }
}

/**
 * Count submissions awaiting review for a broadcast channel.
 */
async function countPendingSubmissions(broadcastId: number): Promise<number> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ count: string }>`
      SELECT COUNT(*)::text AS count
      FROM submissions
      WHERE broadcast_id = ${broadcastId}
        AND in_review   IS NULL
        AND reviewed_by IS NULL
        AND is_rejected  = FALSE
        AND posted_at   IS NULL
    `;
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    logger.error({ msg: "db.countPendingSubmissions failed", broadcastId, error });
    return 0;
  } finally {
    conn.release();
  }
}

export type PendingSubmission = {
  id: string;
  created_by: number;
  content: Record<string, unknown>;
  created_at: string;
};

export type ApprovedSubmission = {
  id: string;
  created_by: number;
  content: Record<string, unknown>;
  reviewed_at: string;
};

/**
 * Assign a role to a user for a specific connection.
 * Upserts so calling this multiple times is safe.
 */
async function assignConnectionRole(
  userId: number,
  connectionId: string,
  role: "user" | "moderator" | "admin",
): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject`
      INSERT INTO connection_roles (user_id, connection_id, role)
      VALUES (${userId}, ${connectionId}, ${role})
      ON CONFLICT (user_id, connection_id) DO UPDATE SET role = EXCLUDED.role
    `;
    logger.trace({ msg: "db.assignConnectionRole", userId, connectionId, role });
  } catch (error) {
    logger.error({ msg: "db.assignConnectionRole failed", userId, connectionId, role, error });
  } finally {
    conn.release();
  }
}

/**
 * Atomically claim the oldest pending submission for review.
 * Uses an UPDATE…WHERE id = (SELECT…) so two concurrent moderators cannot claim the same row.
 * Returns the claimed submission, or null if the queue is empty.
 */
async function claimNextSubmission(broadcastId: number): Promise<PendingSubmission | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<PendingSubmission>({
      text: `
        UPDATE submissions
        SET in_review = NOW()
        WHERE id = (
          SELECT id FROM submissions
          WHERE broadcast_id = $1
            AND in_review   IS NULL
            AND reviewed_by IS NULL
            AND is_rejected  = FALSE
            AND posted_at   IS NULL
          ORDER BY created_at ASC
          LIMIT 1
        )
        RETURNING id, created_by, content, created_at::text
      `,
      args: [broadcastId],
    });
    logger.trace({ msg: "db.claimNextSubmission", broadcastId, claimed: rows[0]?.id ?? null });
    return rows[0] ?? null;
  } catch (error) {
    logger.error({ msg: "db.claimNextSubmission failed", broadcastId, error });
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Release a claimed submission back to the pending queue (skip).
 */
async function unclaimSubmission(submissionId: string): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject`
      UPDATE submissions SET in_review = NULL WHERE id = ${submissionId}
    `;
    logger.trace({ msg: "db.unclaimSubmission", submissionId });
  } catch (error) {
    logger.error({ msg: "db.unclaimSubmission failed", submissionId, error });
  } finally {
    conn.release();
  }
}

/**
 * Mark a submission as approved.
 */
async function approveSubmission(submissionId: string, moderatorId: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject`
      UPDATE submissions
      SET reviewed_by = ${moderatorId}, reviewed_at = NOW(), in_review = NULL
      WHERE id = ${submissionId}
    `;
    logger.trace({ msg: "db.approveSubmission", submissionId, moderatorId });
  } catch (error) {
    logger.error({ msg: "db.approveSubmission failed", submissionId, moderatorId, error });
  } finally {
    conn.release();
  }
}

/**
 * Mark a submission as rejected.
 */
async function rejectSubmission(submissionId: string, moderatorId: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject`
      UPDATE submissions
      SET is_rejected = TRUE, reviewed_by = ${moderatorId}, reviewed_at = NOW(), in_review = NULL
      WHERE id = ${submissionId}
    `;
    logger.trace({ msg: "db.rejectSubmission", submissionId, moderatorId });
  } catch (error) {
    logger.error({ msg: "db.rejectSubmission failed", submissionId, moderatorId, error });
  } finally {
    conn.release();
  }
}

/**
 * Update a submission's content and approve it.
 * Preserves original_content on the first edit.
 */
async function editAndApproveSubmission(
  submissionId: string,
  moderatorId: number,
  newContent: unknown,
): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        UPDATE submissions
        SET
          content          = $1::jsonb,
          original_content = COALESCE(original_content, content),
          reviewed_by      = $2,
          reviewed_at      = NOW(),
          in_review        = NULL
        WHERE id = $3
      `,
      args: [toJsonb(newContent), moderatorId, submissionId],
    });
    logger.trace({ msg: "db.editAndApproveSubmission", submissionId, moderatorId });
  } catch (error) {
    logger.error({ msg: "db.editAndApproveSubmission failed", submissionId, moderatorId, error });
  } finally {
    conn.release();
  }
}

/**
 * Count a user's submissions, broken down by status.
 */
async function getUserSubmissionStats(userId: number): Promise<{ total: number; approved: number; pending: number }> {
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
      args: [userId],
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
async function anonymizeUserSubmissions(userId: number): Promise<number> {
  const conn = await pool.connect();
  try {
    const { rowCount } = await conn.queryObject`
      UPDATE submissions SET created_by = NULL WHERE created_by = ${userId}
    `;
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
async function deleteUserData(userId: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject`UPDATE submissions SET created_by = NULL WHERE created_by = ${userId}`;
    await conn.queryObject`DELETE FROM users WHERE id = ${userId}`;
    // session key for private chats equals the user/chat id
    await conn.queryObject({ text: `DELETE FROM bot_sessions WHERE key = $1`,      args: [String(userId)] });
    await conn.queryObject({ text: `DELETE FROM bot_conversations WHERE key LIKE $1`, args: [`${userId}%`] });
    logger.trace({ msg: "db.deleteUserData", userId });
  } catch (error) {
    logger.error({ msg: "db.deleteUserData failed", userId, error });
  } finally {
    conn.release();
  }
}

/**
 * Atomically dequeue the oldest approved (not yet posted) submission for a broadcast channel.
 * Sets posted_at = NOW() so concurrent /post calls cannot claim the same row.
 * Returns the submission, or null if the queue is empty.
 */
async function dequeueApprovedSubmission(broadcastId: number): Promise<ApprovedSubmission | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<ApprovedSubmission>({
      text: `
        UPDATE submissions
        SET posted_at = NOW()
        WHERE id = (
          SELECT id FROM submissions
          WHERE broadcast_id = $1
            AND reviewed_by IS NOT NULL
            AND is_rejected  = FALSE
            AND posted_at   IS NULL
          ORDER BY reviewed_at ASC
          LIMIT 1
        )
        RETURNING id, created_by, content, reviewed_at::text
      `,
      args: [broadcastId],
    });
    logger.trace({ msg: "db.dequeueApprovedSubmission", broadcastId, dequeued: rows[0]?.id ?? null });
    return rows[0] ?? null;
  } catch (error) {
    logger.error({ msg: "db.dequeueApprovedSubmission failed", broadcastId, error });
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Create a grammY-compatible StorageAdapter backed by a postgres table.
 *
 * The table must exist with the schema:
 *   CREATE TABLE <tableName> (key TEXT PRIMARY KEY, value JSONB NOT NULL);
 *
 * The tableName argument is a compile-time constant — never pass user input here.
 */
function createStorageAdapter<T>(tableName: string) {
  return {
    async read(key: string): Promise<T | undefined> {
      const conn = await pool.connect();
      try {
        const { rows } = await conn.queryObject<{ value: T }>({
          text: `SELECT value FROM ${tableName} WHERE key = $1 LIMIT 1`,
          args: [key],
        });
        logger.trace({ msg: "storage.read", tableName, key, found: rows.length > 0 });
        return rows[0]?.value;
      } catch (error) {
        logger.error({ msg: "storage.read failed", tableName, key, error });
        return undefined;
      } finally {
        conn.release();
      }
    },

    async write(key: string, value: T): Promise<void> {
      const conn = await pool.connect();
      try {
        await conn.queryObject({
          text: `
            INSERT INTO ${tableName} (key, value)
            VALUES ($1, $2::jsonb)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
          `,
          args: [key, toJsonb(value)],
        });
        logger.trace({ msg: "storage.write", tableName, key });
      } catch (error) {
        logger.error({ msg: "storage.write failed", tableName, key });
        console.error(error)
      } finally {
        conn.release();
      }
    },

    async delete(key: string): Promise<void> {
      const conn = await pool.connect();
      try {
        await conn.queryObject({
          text: `DELETE FROM ${tableName} WHERE key = $1`,
          args: [key],
        });
        logger.trace({ msg: "storage.delete", tableName, key });
      } catch (error) {
        logger.error({ msg: "storage.delete failed", tableName, key, error });
      } finally {
        conn.release();
      }
    },
  };
}

export default {
  pool,
  coerceUser,
  getConnectionBySubmitId,
  createConnection,
  deleteConnection,
  createSubmission,
  assignConnectionRole,
  removeConnectionRole,
  isUserAdmin,
  isUserModerator,
  countPendingSubmissions,
  claimNextSubmission,
  unclaimSubmission,
  approveSubmission,
  rejectSubmission,
  editAndApproveSubmission,
  getUserSubmissionStats,
  anonymizeUserSubmissions,
  deleteUserData,
  dequeueApprovedSubmission,
  createStorageAdapter,
};
