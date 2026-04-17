import { logger } from "../logger.ts";
import { pool } from "./pool.ts";

/**
 * Check if a user has admin access for a given connection.
 * Only the per-connection role (connection_roles.role) is considered.
 */
export async function isUserAdmin(userId: number, connectionId: string): Promise<boolean> {
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
    const row = rows[0];
    if (!row) return false;
    return row.role === "admin";
  } catch (error) {
    logger.error({ msg: "db.isUserAdmin failed", userId, connectionId, error });
    return false;
  } finally {
    conn.release();
  }
}

/**
 * Check if a user has moderator or admin access for a given connection.
 * Only the per-connection role (connection_roles.role) is considered.
 */
export async function isUserModerator(userId: number, connectionId: string): Promise<boolean> {
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
    const row = rows[0];
    if (!row) return false;
    return row.role === "moderator" || row.role === "admin";
  } catch (error) {
    logger.error({ msg: "db.isUserModerator failed", userId, connectionId, error });
    return false;
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
