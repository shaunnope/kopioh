import { logger } from "../logger.ts";
import { pool } from "./pool.ts";
import type { ApprovedSubmission } from "./submission.ts";
import { decryptUserId } from "./crypto.ts";

export type Queue = {
  id: string;
  connection_id: string;
  broadcast_id: number;
  logs_id: number | null;
  name: string;
  schedule_type: "interval" | "fixed";
  timezone: string;
  interval_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  times: string[] | null;
  days_of_week: number[] | null;
  last_posted_at: string | null;
  low_submission_threshold: number;
  low_alert_sent_at: string | null;
  created_at: string;
};

export type QueueTemplate = {
  queue_id: string;
  prefix: string | null;
  suffix: string | null;
  use_counter: boolean;
};

export type CreateQueueParams = {
  connectionId: string;
  name: string;
  scheduleType: "interval" | "fixed";
  timezone: string;
  intervalMinutes?: number;
  startTime?: string;
  endTime?: string;
  times?: string[];
  daysOfWeek?: number[] | null;
  lowSubmissionThreshold?: number;
};

const QUEUE_COLS = `
  q.id, q.connection_id, q.name, q.schedule_type, q.timezone,
  q.interval_minutes,
  q.start_time::text AS start_time,
  q.end_time::text   AS end_time,
  q.times::text[]    AS times,
  q.days_of_week,
  q.last_posted_at::text    AS last_posted_at,
  q.low_submission_threshold,
  q.low_alert_sent_at::text AS low_alert_sent_at,
  q.created_at::text        AS created_at,
  c.broadcast_id,
  c.logs_id
`;

export async function createQueue(params: CreateQueueParams): Promise<Queue | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<Queue>({
      text: `
        INSERT INTO queues (
          connection_id, name, schedule_type, timezone,
          interval_minutes, start_time, end_time, times, days_of_week,
          low_submission_threshold
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING
          id, connection_id, name, schedule_type, timezone,
          interval_minutes,
          start_time::text AS start_time,
          end_time::text   AS end_time,
          times::text[]    AS times,
          days_of_week,
          last_posted_at::text    AS last_posted_at,
          low_submission_threshold,
          low_alert_sent_at::text AS low_alert_sent_at,
          created_at::text        AS created_at,
          (SELECT broadcast_id FROM connections WHERE id = connection_id) AS broadcast_id,
          (SELECT logs_id      FROM connections WHERE id = connection_id) AS logs_id
      `,
      args: [
        params.connectionId,
        params.name,
        params.scheduleType,
        params.timezone,
        params.intervalMinutes ?? null,
        params.startTime ?? null,
        params.endTime ?? null,
        params.times ?? null,
        params.daysOfWeek ?? null,
        params.lowSubmissionThreshold ?? 5,
      ],
    });
    logger.trace({ msg: "db.createQueue", connectionId: params.connectionId, name: params.name });
    return rows[0] ?? null;
  } catch (error) {
    logger.error({ msg: "db.createQueue failed", params, error });
    return null;
  } finally {
    conn.release();
  }
}

export async function getQueuesForConnection(connectionId: string): Promise<Queue[]> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<Queue>({
      text: `
        SELECT ${QUEUE_COLS}
        FROM queues q
        JOIN connections c ON c.id = q.connection_id
        WHERE q.connection_id = $1
        ORDER BY q.created_at ASC
      `,
      args: [connectionId],
    });
    return rows;
  } catch (error) {
    logger.error({ msg: "db.getQueuesForConnection failed", connectionId, error });
    return [];
  } finally {
    conn.release();
  }
}

export async function deleteQueue(queueId: string): Promise<boolean> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ id: string }>({
      text: `DELETE FROM queues WHERE id = $1 RETURNING id`,
      args: [queueId],
    });
    logger.trace({ msg: "db.deleteQueue", queueId, deleted: rows.length > 0 });
    return rows.length > 0;
  } catch (error) {
    logger.error({ msg: "db.deleteQueue failed", queueId, error });
    return false;
  } finally {
    conn.release();
  }
}

export async function assignSubmissionToQueue(submissionId: string, queueId: string): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `UPDATE submissions SET queue_id = $1 WHERE id = $2`,
      args: [queueId, submissionId],
    });
    logger.trace({ msg: "db.assignSubmissionToQueue", submissionId, queueId });
  } catch (error) {
    logger.error({ msg: "db.assignSubmissionToQueue failed", submissionId, queueId, error });
  } finally {
    conn.release();
  }
}

/** Clear low_alert_sent_at when a new approval pushes the queue count above the threshold. */
export async function clearLowAlertIfAboveThreshold(queueId: string): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        UPDATE queues
        SET low_alert_sent_at = NULL
        WHERE id = $1
          AND low_alert_sent_at IS NOT NULL
          AND low_submission_threshold > 0
          AND (
            SELECT COUNT(*) FROM submissions
            WHERE queue_id    = $1
              AND reviewed_by IS NOT NULL
              AND is_rejected  = FALSE
              AND posted_at   IS NULL
          ) > low_submission_threshold
      `,
      args: [queueId],
    });
  } catch (error) {
    logger.error({ msg: "db.clearLowAlertIfAboveThreshold failed", queueId, error });
  } finally {
    conn.release();
  }
}

/** Return all queues that have at least one approved, unposted submission. */
export async function getAllQueuesWithPending(): Promise<Queue[]> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<Queue>(`
      SELECT ${QUEUE_COLS}
      FROM queues q
      JOIN connections c ON c.id = q.connection_id
      WHERE EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.queue_id    = q.id
          AND s.reviewed_by IS NOT NULL
          AND s.is_rejected  = FALSE
          AND s.posted_at   IS NULL
      )
    `);
    logger.trace({ msg: "db.getAllQueuesWithPending", count: rows.length });
    return rows;
  } catch (error) {
    logger.error({ msg: "db.getAllQueuesWithPending failed", error });
    return [];
  } finally {
    conn.release();
  }
}

/** Atomically claim the oldest approved submission from a queue. */
export async function dequeueFromQueue(queueId: string): Promise<ApprovedSubmission | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<ApprovedSubmission>({
      text: `
        UPDATE submissions
        SET posted_at = NOW()
        WHERE id = (
          SELECT id FROM submissions
          WHERE queue_id    = $1
            AND reviewed_by IS NOT NULL
            AND is_rejected  = FALSE
            AND posted_at   IS NULL
          ORDER BY reviewed_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, created_by, content, reviewed_at::text
      `,
      args: [queueId],
    });
    const row = rows[0] ?? null;
    if (row?.created_by != null) row.created_by = await decryptUserId(row.created_by as unknown as string);
    logger.trace({ msg: "db.dequeueFromQueue", queueId, dequeued: row?.id ?? null });
    return row;
  } catch (error) {
    logger.error({ msg: "db.dequeueFromQueue failed", queueId, error });
    return null;
  } finally {
    conn.release();
  }
}

export async function updateLastPosted(queueId: string): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `UPDATE queues SET last_posted_at = NOW() WHERE id = $1`,
      args: [queueId],
    });
  } catch (error) {
    logger.error({ msg: "db.updateLastPosted failed", queueId, error });
  } finally {
    conn.release();
  }
}

export async function countQueueApproved(queueId: string): Promise<number> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ count: string }>({
      text: `
        SELECT COUNT(*)::text AS count FROM submissions
        WHERE queue_id    = $1
          AND reviewed_by IS NOT NULL
          AND is_rejected  = FALSE
          AND posted_at   IS NULL
      `,
      args: [queueId],
    });
    return parseInt(rows[0]?.count ?? "0", 10);
  } catch (error) {
    logger.error({ msg: "db.countQueueApproved failed", queueId, error });
    return 0;
  } finally {
    conn.release();
  }
}

/** Atomically increment the counter and return the new value. */
export async function incrementCounter(queueId: string): Promise<number> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ value: number }>({
      text: `
        INSERT INTO queue_counters (queue_id, value) VALUES ($1, 1)
        ON CONFLICT (queue_id) DO UPDATE SET value = queue_counters.value + 1
        RETURNING value
      `,
      args: [queueId],
    });
    return rows[0]?.value ?? 1;
  } catch (error) {
    logger.error({ msg: "db.incrementCounter failed", queueId, error });
    return 0;
  } finally {
    conn.release();
  }
}

export async function markLowAlertSent(queueId: string): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `UPDATE queues SET low_alert_sent_at = NOW() WHERE id = $1`,
      args: [queueId],
    });
  } catch (error) {
    logger.error({ msg: "db.markLowAlertSent failed", queueId, error });
  } finally {
    conn.release();
  }
}

export async function upsertQueueTemplate(
  queueId: string,
  params: { prefix: string | null; suffix: string | null; useCounter: boolean },
): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO queue_templates (queue_id, prefix, suffix, use_counter)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (queue_id) DO UPDATE
          SET prefix = EXCLUDED.prefix,
              suffix = EXCLUDED.suffix,
              use_counter = EXCLUDED.use_counter
      `,
      args: [queueId, params.prefix, params.suffix, params.useCounter],
    });
    logger.trace({ msg: "db.upsertQueueTemplate", queueId });
  } catch (error) {
    logger.error({ msg: "db.upsertQueueTemplate failed", queueId, error });
  } finally {
    conn.release();
  }
}

export async function getQueueTemplate(queueId: string): Promise<QueueTemplate | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<QueueTemplate>({
      text: `SELECT queue_id, prefix, suffix, use_counter FROM queue_templates WHERE queue_id = $1`,
      args: [queueId],
    });
    return rows[0] ?? null;
  } catch (error) {
    logger.error({ msg: "db.getQueueTemplate failed", queueId, error });
    return null;
  } finally {
    conn.release();
  }
}

export async function getUnqueuedSubmissions(broadcastId: number): Promise<ApprovedSubmission[]> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<ApprovedSubmission>({
      text: `
        SELECT id, created_by, content, reviewed_at::text
        FROM submissions
        WHERE broadcast_id = $1
          AND reviewed_by IS NOT NULL
          AND is_rejected  = FALSE
          AND posted_at   IS NULL
          AND queue_id    IS NULL
        ORDER BY reviewed_at ASC
      `,
      args: [broadcastId],
    });
    return await Promise.all(rows.map(async r => {
      if (r.created_by != null) r.created_by = await decryptUserId(r.created_by as unknown as string);
      return r;
    }));
  } catch (error) {
    logger.error({ msg: "db.getUnqueuedSubmissions failed", broadcastId, error });
    return [];
  } finally {
    conn.release();
  }
}

export async function getQueueSubmissions(queueId: string): Promise<ApprovedSubmission[]> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<ApprovedSubmission>({
      text: `
        SELECT id, created_by, content, reviewed_at::text
        FROM submissions
        WHERE queue_id    = $1
          AND reviewed_by IS NOT NULL
          AND is_rejected  = FALSE
          AND posted_at   IS NULL
        ORDER BY reviewed_at ASC
      `,
      args: [queueId],
    });
    return await Promise.all(rows.map(async r => {
      if (r.created_by != null) r.created_by = await decryptUserId(r.created_by as unknown as string);
      return r;
    }));
  } catch (error) {
    logger.error({ msg: "db.getQueueSubmissions failed", queueId, error });
    return [];
  } finally {
    conn.release();
  }
}
