import { logger } from "../logger.ts";
import { pool } from "./pool.ts";

export async function getDefaultConnection(): Promise<{ id: string; broadcastId: number; submitId: number; logsId: number | null } | null> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ id: string; broadcast_id: number; submit_id: number; logs_id: number | null }>({
      text: `
        SELECT c.id, c.broadcast_id, c.submit_id, c.logs_id
        FROM global_config gc
        JOIN connections c ON c.id = gc.default_connection_id
        WHERE gc.default_connection_id IS NOT NULL
        LIMIT 1
      `,
      args: [],
    });
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      broadcastId: Number(rows[0].broadcast_id),
      submitId: Number(rows[0].submit_id),
      logsId: rows[0].logs_id != null ? Number(rows[0].logs_id) : null,
    };
  } catch (error) {
    logger.error({ msg: "db.getDefaultConnection failed", error });
    return null;
  } finally {
    conn.release();
  }
}

export async function setDefaultConnection(connectionId: string): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO global_config (singleton, default_connection_id)
        VALUES (TRUE, $1)
        ON CONFLICT (singleton) DO UPDATE SET default_connection_id = EXCLUDED.default_connection_id
      `,
      args: [connectionId],
    });
    logger.trace({ msg: "db.setDefaultConnection", connectionId });
  } catch (error) {
    logger.error({ msg: "db.setDefaultConnection failed", connectionId, error });
  } finally {
    conn.release();
  }
}
