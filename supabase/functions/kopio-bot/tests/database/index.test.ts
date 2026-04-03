import { describe, it, afterEach, afterAll } from "jsr:@std/testing/bdd";
import { assertEquals, assertExists } from "jsr:@std/assert";
import db from "../../database/index.ts";

// Stable test IDs — isolated from real data
const SUBMIT_ID = -9_888_010;
const BROADCAST_ID = -9_888_011;
const USER_ID = 9_888_010;

describe("database", () => {
  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
    // Clean up user via raw pool query
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  describe("coerceUser", () => {
    it("inserts a new user", async () => {
      await db.coerceUser(USER_ID);

      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{ id: number }>`
          SELECT id FROM users WHERE id = ${USER_ID}
        `;
        assertEquals(Number(rows[0]?.id), USER_ID);
      } finally {
        conn.release();
      }
    });

    it("is idempotent on conflict", async () => {
      await db.coerceUser(USER_ID);
      await db.coerceUser(USER_ID); // should not throw
    });
  });

  describe("getConnectionBySubmitId", () => {
    it("returns null when not found", async () => {
      const result = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertEquals(result, null);
    });

    it("returns the connection row when found", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);

      const result = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertExists(result);
      assertEquals(Number(result.broadcast_id), BROADCAST_ID);
    });
  });

  describe("createConnection", () => {
    it("creates a connection and returns its id", async () => {
      const id = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      assertExists(id);
    });

    it("returns null on duplicate (broadcast_id, submit_id)", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      const id = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      assertEquals(id, null);
    });
  });

  describe("deleteConnection", () => {
    it("returns false when no connection exists", async () => {
      const deleted = await db.deleteConnection(SUBMIT_ID);
      assertEquals(deleted, false);
    });

    it("returns true and removes the row", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);

      const deleted = await db.deleteConnection(SUBMIT_ID);
      assertEquals(deleted, true);

      const remaining = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertEquals(remaining, null);
    });
  });
});
