import { logger } from "../logger.ts";
import { toJsonb } from "./serializer.ts";
import { pool } from "./pool.ts";
import { encryptUserId, decryptUserId } from "./crypto.ts";

export type ImportInput = {
  status?: string;
  created_by?: number | null;
  content: unknown;
  queue_id?: string | null;
};

export type ExportRow = {
  id: string;
  status: "pending" | "in_review" | "approved" | "posted" | "rejected";
  created_by: number | null;
  content: Record<string, unknown>;
  queue_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  posted_at: string | null;
};

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
 * Insert a new submission and return its UUID, or null on failure.
 */
export async function createSubmission(
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
      args: [broadcastId, await encryptUserId(createdBy), toJsonb(content)],
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
 * Count submissions awaiting review for a broadcast channel.
 */
export async function countPendingSubmissions(broadcastId: number): Promise<number> {
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

/**
 * Atomically claim the oldest pending submission for review.
 * Uses an UPDATE…WHERE id = (SELECT…) so two concurrent moderators cannot claim the same row.
 * Returns the claimed submission, or null if the queue is empty.
 */
export async function claimNextSubmission(broadcastId: number): Promise<PendingSubmission | null> {
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
    const row = rows[0] ?? null;
    if (row?.created_by != null) row.created_by = await decryptUserId(row.created_by as unknown as string);
    logger.trace({ msg: "db.claimNextSubmission", broadcastId, claimed: row?.id ?? null });
    return row;
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
export async function unclaimSubmission(submissionId: string): Promise<void> {
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
export async function approveSubmission(submissionId: string, moderatorId: number): Promise<void> {
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
export async function rejectSubmission(submissionId: string, moderatorId: number): Promise<void> {
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
export async function editAndApproveSubmission(
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
 * Atomically dequeue the oldest approved (not yet posted) submission for a broadcast channel.
 * Sets posted_at = NOW() so concurrent /post calls cannot claim the same row.
 * Returns the submission, or null if the queue is empty.
 */
export async function dequeueApprovedSubmission(broadcastId: number): Promise<ApprovedSubmission | null> {
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
    const row = rows[0] ?? null;
    if (row?.created_by != null) row.created_by = await decryptUserId(row.created_by as unknown as string);
    logger.trace({ msg: "db.dequeueApprovedSubmission", broadcastId, dequeued: row?.id ?? null });
    return row;
  } catch (error) {
    logger.error({ msg: "db.dequeueApprovedSubmission failed", broadcastId, error });
    return null;
  } finally {
    conn.release();
  }
}

/**
 * Fetch all submissions for a broadcast channel, with computed status, for export.
 * Ordered oldest-first. created_by is excluded (encrypted).
 */
export async function getSubmissionsForExport(broadcastId: number): Promise<ExportRow[]> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<Omit<ExportRow, "created_by"> & { created_by: string | null }>({
      text: `
        SELECT
          id,
          created_by,
          content,
          queue_id,
          created_at::text,
          reviewed_at::text,
          posted_at::text,
          CASE
            WHEN is_rejected = TRUE      THEN 'rejected'
            WHEN posted_at   IS NOT NULL THEN 'posted'
            WHEN reviewed_by IS NOT NULL THEN 'approved'
            WHEN in_review   IS NOT NULL THEN 'in_review'
            ELSE 'pending'
          END AS status
        FROM submissions
        WHERE broadcast_id = $1
        ORDER BY created_at ASC
      `,
      args: [broadcastId],
    });
    const decrypted = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        created_by: row.created_by != null ? await decryptUserId(row.created_by) : null,
      })),
    );
    logger.trace({ msg: "db.getSubmissionsForExport", broadcastId, count: decrypted.length });
    return decrypted;
  } catch (error) {
    logger.error({ msg: "db.getSubmissionsForExport failed", broadcastId, error });
    return [];
  } finally {
    conn.release();
  }
}

/**
 * Bulk-insert imported submissions within a single transaction.
 * Entries with status "approved" or "posted" are auto-approved when autoApprove is true,
 * with the importer recorded as reviewer. queue_id is preserved only when it exists in
 * validQueueIds; otherwise it is set to null.
 */
export async function importSubmissions(
  broadcastId: number,
  entries: ImportInput[],
  importerId: number,
  autoApprove: boolean,
  validQueueIds: Set<string>,
): Promise<{ imported: number; approved: number }> {
  const conn = await pool.connect();
  try {
    await conn.queryObject`BEGIN`;
    let imported = 0;
    let approved = 0;

    for (const entry of entries) {
      const shouldApprove = autoApprove && (entry.status === "approved" || entry.status === "posted");
      const queueId = entry.queue_id && validQueueIds.has(entry.queue_id) ? entry.queue_id : null;
      const encryptedCreator = entry.created_by != null ? await encryptUserId(entry.created_by) : null;

      if (shouldApprove) {
        await conn.queryObject({
          text: `
            INSERT INTO submissions (broadcast_id, created_by, content, queue_id, reviewed_by, reviewed_at)
            VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
          `,
          args: [broadcastId, encryptedCreator, toJsonb(entry.content), queueId, importerId],
        });
        approved++;
      } else {
        await conn.queryObject({
          text: `
            INSERT INTO submissions (broadcast_id, created_by, content, queue_id)
            VALUES ($1, $2, $3::jsonb, $4)
          `,
          args: [broadcastId, encryptedCreator, toJsonb(entry.content), queueId],
        });
      }
      imported++;
    }

    await conn.queryObject`COMMIT`;
    logger.trace({ msg: "db.importSubmissions", broadcastId, imported, approved });
    return { imported, approved };
  } catch (error) {
    await conn.queryObject`ROLLBACK`;
    logger.error({ msg: "db.importSubmissions failed", broadcastId, error });
    throw error;
  } finally {
    conn.release();
  }
}
