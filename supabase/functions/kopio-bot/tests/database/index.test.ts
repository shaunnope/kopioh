import { describe, it, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists, assertMatch } from "@std/assert";
import db from "../../database/index.ts";

// Stable test IDs — isolated from real data
const SUBMIT_ID = -9_888_010;
const BROADCAST_ID = -9_888_011;
const USER_ID = 9_888_010;
const STORAGE_TABLE = "bot_sessions";
const STORAGE_KEY = "db_test_storage_key";

describe("database", () => {
  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM submissions WHERE created_by = ${USER_ID}`;
      await conn.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key = ${STORAGE_KEY}`;
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

  describe("createSubmission", () => {
    it("inserts a submission and returns a UUID", async () => {
      await db.coerceUser(USER_ID);
      const content = { text: "Hello world" };

      const id = await db.createSubmission(BROADCAST_ID, USER_ID, content);

      assertExists(id);
      assertMatch(id, /^[0-9a-f-]{36}$/);
    });

    it("persists the correct fields", async () => {
      await db.coerceUser(USER_ID);
      const content = { text: "Test post" };

      const id = await db.createSubmission(BROADCAST_ID, USER_ID, content);

      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{
          broadcast_id: number;
          created_by: number;
          content: unknown;
          is_rejected: boolean;
        }>`SELECT broadcast_id, created_by, content, is_rejected
           FROM submissions WHERE id = ${id}`;

        assertExists(rows[0]);
        assertEquals(Number(rows[0].broadcast_id), BROADCAST_ID);
        assertEquals(Number(rows[0].created_by), USER_ID);
        assertEquals((rows[0].content as { text: string }).text, "Test post");
        assertEquals(rows[0].is_rejected, false);
      } finally {
        conn.release();
      }
    });

    it("returns null when user does not exist (FK violation)", async () => {
      const id = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "x" });
      assertEquals(id, null);
    });
  });

  describe("dequeueApprovedSubmission", () => {
    it("returns null when no submissions exist", async () => {
      const result = await db.dequeueApprovedSubmission(BROADCAST_ID);
      assertEquals(result, null);
    });

    it("returns null when submissions are pending (not yet approved)", async () => {
      await db.coerceUser(USER_ID);
      await db.createSubmission(BROADCAST_ID, USER_ID, { text: "Pending" });

      const result = await db.dequeueApprovedSubmission(BROADCAST_ID);
      assertEquals(result, null);
    });

    it("returns null when the only submission is rejected", async () => {
      await db.coerceUser(USER_ID);
      await db.createSubmission(BROADCAST_ID, USER_ID, { text: "Rejected" });
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.rejectSubmission(claimed.id, USER_ID);

      const result = await db.dequeueApprovedSubmission(BROADCAST_ID);
      assertEquals(result, null);
    });

    it("returns null when the only approved submission is already posted", async () => {
      await db.coerceUser(USER_ID);
      await db.createSubmission(BROADCAST_ID, USER_ID, { text: "Already posted" });
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.approveSubmission(claimed.id, USER_ID);
      await db.dequeueApprovedSubmission(BROADCAST_ID); // first call marks it posted

      const result = await db.dequeueApprovedSubmission(BROADCAST_ID);
      assertEquals(result, null);
    });

    it("returns the approved submission with correct fields", async () => {
      await db.coerceUser(USER_ID);
      const id = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "Ready to post" });
      assertExists(id);
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.approveSubmission(claimed.id, USER_ID);

      const result = await db.dequeueApprovedSubmission(BROADCAST_ID);
      assertExists(result);
      assertEquals(result.id, id);
      assertEquals((result.content as { text: string }).text, "Ready to post");
    });

    it("sets posted_at on the dequeued row", async () => {
      await db.coerceUser(USER_ID);
      const id = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "Post me" });
      assertExists(id);
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.approveSubmission(claimed.id, USER_ID);

      await db.dequeueApprovedSubmission(BROADCAST_ID);

      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{ posted_at: string | null }>`
          SELECT posted_at FROM submissions WHERE id = ${id}
        `;
        assertExists(rows[0]?.posted_at);
      } finally {
        conn.release();
      }
    });

    it("each call dequeues a different submission until the queue is empty", async () => {
      await db.coerceUser(USER_ID);
      const id1 = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "First" });
      const id2 = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "Second" });
      assertExists(id1);
      assertExists(id2);

      const s1 = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(s1);
      await db.approveSubmission(s1.id, USER_ID);
      const s2 = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(s2);
      await db.approveSubmission(s2.id, USER_ID);

      const dequeued1 = await db.dequeueApprovedSubmission(BROADCAST_ID);
      const dequeued2 = await db.dequeueApprovedSubmission(BROADCAST_ID);
      const dequeued3 = await db.dequeueApprovedSubmission(BROADCAST_ID);

      assertExists(dequeued1);
      assertExists(dequeued2);
      assertEquals(new Set([dequeued1.id, dequeued2.id]), new Set([id1, id2]));
      assertEquals(dequeued3, null);
    });
  });

  describe("createStorageAdapter", () => {
    const adapter = db.createStorageAdapter<{ count: number }>(STORAGE_TABLE);

    it("read returns undefined for a missing key", async () => {
      const value = await adapter.read(STORAGE_KEY);
      assertEquals(value, undefined);
    });

    it("write then read returns the stored value", async () => {
      await adapter.write(STORAGE_KEY, { count: 42 });
      const value = await adapter.read(STORAGE_KEY);
      assertEquals(value, { count: 42 });
    });

    it("write overwrites an existing value", async () => {
      await adapter.write(STORAGE_KEY, { count: 1 });
      await adapter.write(STORAGE_KEY, { count: 99 });
      const value = await adapter.read(STORAGE_KEY);
      assertEquals(value, { count: 99 });
    });

    it("delete removes the key", async () => {
      await adapter.write(STORAGE_KEY, { count: 1 });
      await adapter.delete(STORAGE_KEY);
      const value = await adapter.read(STORAGE_KEY);
      assertEquals(value, undefined);
    });

    it("delete is a no-op for a missing key", async () => {
      await adapter.delete(STORAGE_KEY); // should not throw
    });
  });
});
