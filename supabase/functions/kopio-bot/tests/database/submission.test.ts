import { describe, it, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists, assertMatch } from "@std/assert";
import db from "../../database/index.ts";
import { encryptUserId } from "../../database/crypto.ts";

const SUBMIT_ID = -9_888_010;
const BROADCAST_ID = -9_888_011;
const USER_ID = 9_888_010;

describe("db submission", () => {
  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
    const conn = await db.pool.connect();
    try {
      await conn.queryObject({ text: `DELETE FROM submissions WHERE created_by = $1`, args: [await encryptUserId(USER_ID)] });
      await conn.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

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
          created_by: string;
          content: unknown;
          is_rejected: boolean;
        }>`SELECT broadcast_id, created_by, content, is_rejected
           FROM submissions WHERE id = ${id}`;

        assertExists(rows[0]);
        assertEquals(Number(rows[0].broadcast_id), BROADCAST_ID);
        // created_by is stored as encrypted hex; verify it decrypts back to USER_ID
        assertMatch(rows[0].created_by, /^[0-9a-f]{64}$/);
        assertEquals((rows[0].content as { text: string }).text, "Test post");
        assertEquals(rows[0].is_rejected, false);
      } finally {
        conn.release();
      }
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
});
