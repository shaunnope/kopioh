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

/**
 * Insert a new submission and return its UUID, or null on failure.
 */
async function createSubmission(
  broadcastId: number,
  createdBy: number,
  content: unknown,
  contentType: "message" | "poll" = "message",
) {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ id: string }>({
      text: `
        INSERT INTO submissions (broadcast_id, created_by, content, content_type)
        VALUES ($1, $2, $3::jsonb, $4)
        RETURNING id
      `,
      args: [broadcastId, createdBy, JSON.stringify(content, (_, v) => typeof v === "bigint" ? Number(v) : v), contentType],
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
          args: [key, JSON.stringify(value, (_, v) => typeof v === "bigint" ? Number(v) : v)],
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
  createStorageAdapter,
};
