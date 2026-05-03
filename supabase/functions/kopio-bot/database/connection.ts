import { logger } from "../logger.ts";
import { pool } from "./pool.ts";

/**
 * Look up a connection by its submit chat ID.
 * Returns the connection row, or null if not found.
 */
export async function getConnectionBySubmitId(submitId: number) {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ id: string; broadcast_id: number; submit_id: number; logs_id: number | null }>`
      SELECT id, broadcast_id, submit_id, logs_id FROM connections WHERE submit_id = ${submitId} LIMIT 1
    `;
    logger.trace({ msg: "db.getConnectionBySubmitId", submitId, found: rows.length > 0 });
    const row = rows[0];
    if (!row) return null;
    return { 
      ...row, 
      broadcast_id: Number(row.broadcast_id), 
      submit_id: Number(row.submit_id), 
      logs_id: row.logs_id != null ? Number(row.logs_id) : null 
    };
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
export async function createConnection(broadcastId: number, submitId: number) {
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
export async function deleteConnection(submitId: number) {
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

export async function setLogsChannel(connectionId: string, logsId: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `UPDATE connections SET logs_id = $1 WHERE id = $2`,
      args: [logsId, connectionId],
    });
    logger.trace({ msg: "db.setLogsChannel", connectionId, logsId });
  } catch (error) {
    logger.error({ msg: "db.setLogsChannel failed", connectionId, logsId, error });
  } finally {
    conn.release();
  }
}

export async function clearLogsChannel(connectionId: string): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `UPDATE connections SET logs_id = NULL WHERE id = $1`,
      args: [connectionId],
    });
    logger.trace({ msg: "db.clearLogsChannel", connectionId });
  } catch (error) {
    logger.error({ msg: "db.clearLogsChannel failed", connectionId, error });
  } finally {
    conn.release();
  }
}

export async function getLogsChannel(connectionId: string): Promise<number | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ logs_id: number | null }>({
      text: `SELECT logs_id FROM connections WHERE id = $1`,
      args: [connectionId],
    });
    return rows[0]?.logs_id ?? null;
  } catch (error) {
    logger.error({ msg: "db.getLogsChannel failed", connectionId, error });
    return null;
  } finally {
    conn.release();
  }
}
