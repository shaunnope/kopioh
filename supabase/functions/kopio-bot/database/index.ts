import { Pool } from "postgres";
import { config } from "../config.ts";
import { logger } from "../logger.ts";

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
    const { rows } = await conn.queryObject<{ id: string; broadcast_id: number }>`
      SELECT id, broadcast_id FROM connections WHERE submit_id = ${submitId} LIMIT 1
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

export default {
  pool,
  coerceUser,
  getConnectionBySubmitId,
  createConnection,
  deleteConnection,
};
