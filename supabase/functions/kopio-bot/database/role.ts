import { logger } from "../logger.ts";
import { pool } from "./pool.ts";

export type ConnectionRole = "user" | "moderator" | "admin";

/**
 * Return the role a user holds for a given connection.
 * Falls back to 'user' when no explicit role has been assigned.
 * Returns 'user' on any error so callers always get a safe default.
 */
export async function getConnectionRole(userId: number, connectionId: string): Promise<ConnectionRole> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{ role: string }>({
      text: `
        SELECT COALESCE(cr.role::text, 'user') AS role
        FROM users u
        LEFT JOIN connection_roles cr
          ON cr.user_id = u.id AND cr.connection_id = $2
        WHERE u.id = $1
      `,
      args: [userId, connectionId],
    });
    return (rows[0]?.role ?? "user") as ConnectionRole;
  } catch (error) {
    logger.error({ msg: "db.getConnectionRole failed", userId, connectionId, error });
    return "user";
  } finally {
    conn.release();
  }
}

/**
 * Assign a role to a user for a specific connection.
 * Upserts so calling this multiple times is safe.
 */
export async function assignConnectionRole(
  userId: number,
  connectionId: string,
  role: ConnectionRole,
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
 * Clear all roles for a connection and assign the given user as the sole admin.
 */
export async function resetConnectionRoles(connectionId: string, ownerId: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject`DELETE FROM connection_roles WHERE connection_id = ${connectionId}`;
    await conn.queryObject`
      INSERT INTO connection_roles (user_id, connection_id, role)
      VALUES (${ownerId}, ${connectionId}, 'admin')
      ON CONFLICT (user_id, connection_id) DO UPDATE SET role = 'admin'
    `;
    logger.trace({ msg: "db.resetConnectionRoles", connectionId, ownerId });
  } catch (error) {
    logger.error({ msg: "db.resetConnectionRoles failed", connectionId, ownerId, error });
  } finally {
    conn.release();
  }
}

/**
 * Remove a user's connection-scoped role, reverting them to the default 'user' role.
 */
export async function removeConnectionRole(userId: number, connectionId: string): Promise<void> {
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
