import { logger } from "../logger.ts";
import { toJsonb } from "./serializer.ts";
import { pool } from "./pool.ts";

/**
 * Create a grammY-compatible StorageAdapter backed by a postgres table.
 *
 * The table must exist with the schema:
 *   CREATE TABLE <tableName> (key TEXT PRIMARY KEY, value JSONB NOT NULL);
 *
 * The tableName argument is a compile-time constant — never pass user input here.
 */
export function createStorageAdapter<T>(tableName: string) {
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
        logger.trace({ msg: "storage.write", tableName, key })
      } catch (error) {
        logger.error({ msg: "storage.write failed", tableName, key, err: error })
      } finally {
        conn.release()
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
