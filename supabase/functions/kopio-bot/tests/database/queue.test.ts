import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists, assertMatch, assertFalse } from "@std/assert";
import db from "../../database/index.ts";

const BROADCAST_ID       = -9_888_040;
const OTHER_BROADCAST_ID = -9_888_041;
const SUBMIT_ID          = -9_888_044;
const OTHER_SUBMIT_ID    = -9_888_045;
const USER_ID            =  9_888_040;

const INTERVAL_PARAMS = {
  scheduleType: "interval" as const,
  timezone: "UTC",
  intervalMinutes: 60,
  startTime: "08:00:00",
  endTime: "23:00:00",
};

describe("db queue", () => {
  let connectionId: string;
  let otherConnectionId: string;

  beforeEach(async () => {
    await db.coerceUser(USER_ID);
    const id1 = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    assertExists(id1);
    connectionId = id1!;
    const id2 = await db.createConnection(OTHER_BROADCAST_ID, OTHER_SUBMIT_ID);
    assertExists(id2);
    otherConnectionId = id2!;
  });

  afterEach(async () => {
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM submissions WHERE broadcast_id IN (${BROADCAST_ID}, ${OTHER_BROADCAST_ID})`;
      await conn.queryObject`DELETE FROM connections WHERE broadcast_id IN (${BROADCAST_ID}, ${OTHER_BROADCAST_ID})`;
      await conn.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  describe("createQueue", () => {
    it("inserts a queue and returns correct fields", async () => {
      const queue = await db.createQueue({ connectionId, name: "daily", ...INTERVAL_PARAMS });

      assertExists(queue);
      assertMatch(queue.id, /^[0-9a-f-]{36}$/);
      assertEquals(queue.name, "daily");
      assertEquals(queue.schedule_type, "interval");
      assertEquals(queue.interval_minutes, 60);
      assertEquals(queue.timezone, "UTC");
      assertEquals(Number(queue.broadcast_id), BROADCAST_ID);
    });

    it("returns null on duplicate name for the same connection", async () => {
      await db.createQueue({ connectionId, name: "hourly", ...INTERVAL_PARAMS });
      const dupe = await db.createQueue({ connectionId, name: "hourly", ...INTERVAL_PARAMS });
      assertEquals(dupe, null);
    });

    it("allows the same name on a different connection", async () => {
      await db.createQueue({ connectionId, name: "daily", ...INTERVAL_PARAMS });
      const other = await db.createQueue({ connectionId: otherConnectionId, name: "daily", ...INTERVAL_PARAMS });
      assertExists(other);
    });
  });

  describe("getQueuesForConnection", () => {
    it("returns empty array when no queues exist", async () => {
      const queues = await db.getQueuesForConnection(connectionId);
      assertEquals(queues.length, 0);
    });

    it("returns queues ordered by creation time", async () => {
      await db.createQueue({ connectionId, name: "daily", ...INTERVAL_PARAMS });
      await db.createQueue({ connectionId, name: "hourly", ...INTERVAL_PARAMS });

      const queues = await db.getQueuesForConnection(connectionId);
      assertEquals(queues.length, 2);
      assertEquals(queues[0].name, "daily");
      assertEquals(queues[1].name, "hourly");
    });

    it("does not return queues from other connections", async () => {
      await db.createQueue({ connectionId: otherConnectionId, name: "daily", ...INTERVAL_PARAMS });

      const queues = await db.getQueuesForConnection(connectionId);
      assertEquals(queues.length, 0);
    });
  });

  describe("deleteQueue", () => {
    it("deletes an existing queue and returns true", async () => {
      const queue = await db.createQueue({ connectionId, name: "temp", ...INTERVAL_PARAMS });
      assertExists(queue);

      const deleted = await db.deleteQueue(queue.id);
      assertEquals(deleted, true);

      const remaining = await db.getQueuesForConnection(connectionId);
      assertEquals(remaining.length, 0);
    });

    it("returns false for a non-existent id", async () => {
      const deleted = await db.deleteQueue("00000000-0000-0000-0000-000000000000");
      assertFalse(deleted);
    });

    it("sets queue_id to NULL on submissions when the queue is deleted", async () => {
      const queue = await db.createQueue({ connectionId, name: "temp", ...INTERVAL_PARAMS });
      assertExists(queue);

      const subId = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "test" });
      assertExists(subId);
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.approveSubmission(claimed.id, USER_ID);
      await db.assignSubmissionToQueue(subId, queue.id);

      await db.deleteQueue(queue.id);

      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{ queue_id: string | null }>`
          SELECT queue_id FROM submissions WHERE id = ${subId}
        `;
        assertEquals(rows[0]?.queue_id, null);
      } finally {
        conn.release();
      }
    });
  });

  describe("assignSubmissionToQueue", () => {
    it("sets queue_id on the submission", async () => {
      const queue = await db.createQueue({ connectionId, name: "main", ...INTERVAL_PARAMS });
      assertExists(queue);

      const subId = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "hello" });
      assertExists(subId);
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.approveSubmission(claimed.id, USER_ID);
      await db.assignSubmissionToQueue(subId, queue.id);

      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{ queue_id: string }>`
          SELECT queue_id FROM submissions WHERE id = ${subId}
        `;
        assertEquals(rows[0]?.queue_id, queue.id);
      } finally {
        conn.release();
      }
    });
  });

  describe("getAllQueuesWithPending", () => {
    it("returns a queue that has approved pending submissions", async () => {
      const queue = await db.createQueue({ connectionId, name: "auto", ...INTERVAL_PARAMS });
      assertExists(queue);

      const subId = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "ready" });
      assertExists(subId);
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.approveSubmission(claimed.id, USER_ID);
      await db.assignSubmissionToQueue(subId, queue.id);

      const pending = await db.getAllQueuesWithPending();
      const found = pending.find((q) => q.id === queue.id);
      assertExists(found);
    });

    it("does not return a queue with no approved submissions", async () => {
      const queue = await db.createQueue({ connectionId, name: "empty", ...INTERVAL_PARAMS });
      assertExists(queue);

      const pending = await db.getAllQueuesWithPending();
      const found = pending.find((q) => q.id === queue.id);
      assertEquals(found, undefined);
    });

    it("does not return a queue whose submissions are all posted", async () => {
      const queue = await db.createQueue({ connectionId, name: "posted", ...INTERVAL_PARAMS });
      assertExists(queue);

      const subId = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "was posted" });
      assertExists(subId);
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.approveSubmission(claimed.id, USER_ID);
      await db.assignSubmissionToQueue(subId, queue.id);
      await db.dequeueFromQueue(queue.id);

      const pending = await db.getAllQueuesWithPending();
      const found = pending.find((q) => q.id === queue.id);
      assertEquals(found, undefined);
    });
  });

  describe("dequeueFromQueue", () => {
    it("returns null when the queue has no approved submissions", async () => {
      const queue = await db.createQueue({ connectionId, name: "empty", ...INTERVAL_PARAMS });
      assertExists(queue);

      const result = await db.dequeueFromQueue(queue.id);
      assertEquals(result, null);
    });

    it("returns null when the only submission is pending (not approved)", async () => {
      const queue = await db.createQueue({ connectionId, name: "q", ...INTERVAL_PARAMS });
      assertExists(queue);

      const subId = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "pending" });
      assertExists(subId);
      await db.assignSubmissionToQueue(subId, queue.id);

      const result = await db.dequeueFromQueue(queue.id);
      assertEquals(result, null);
    });

    it("dequeues the oldest approved submission and marks it posted", async () => {
      const queue = await db.createQueue({ connectionId, name: "q", ...INTERVAL_PARAMS });
      assertExists(queue);

      const subId = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "first" });
      assertExists(subId);
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.approveSubmission(claimed.id, USER_ID);
      await db.assignSubmissionToQueue(subId, queue.id);

      const result = await db.dequeueFromQueue(queue.id);
      assertExists(result);
      assertEquals(result.id, subId);
      assertEquals((result.content as { text: string }).text, "first");

      // Second call returns null — submission is now posted
      const again = await db.dequeueFromQueue(queue.id);
      assertEquals(again, null);
    });

    it("dequeues in review order (FIFO)", async () => {
      const queue = await db.createQueue({ connectionId, name: "q", ...INTERVAL_PARAMS });
      assertExists(queue);

      const id1 = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "alpha" });
      const id2 = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "beta" });
      assertExists(id1); assertExists(id2);

      const s1 = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(s1);
      await db.approveSubmission(s1.id, USER_ID);
      await db.assignSubmissionToQueue(s1.id, queue.id);

      const s2 = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(s2);
      await db.approveSubmission(s2.id, USER_ID);
      await db.assignSubmissionToQueue(s2.id, queue.id);

      const d1 = await db.dequeueFromQueue(queue.id);
      const d2 = await db.dequeueFromQueue(queue.id);
      assertExists(d1); assertExists(d2);
      assertEquals(d1.id, id1);
      assertEquals(d2.id, id2);
    });
  });

  describe("getQueueSubmissions", () => {
    it("returns empty array for an empty queue", async () => {
      const queue = await db.createQueue({ connectionId, name: "q", ...INTERVAL_PARAMS });
      assertExists(queue);

      const subs = await db.getQueueSubmissions(queue.id);
      assertEquals(subs.length, 0);
    });

    it("returns approved unposted submissions in FIFO order", async () => {
      const queue = await db.createQueue({ connectionId, name: "q", ...INTERVAL_PARAMS });
      assertExists(queue);

      const id1 = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "first" });
      const id2 = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "second" });
      assertExists(id1); assertExists(id2);

      const s1 = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(s1);
      await db.approveSubmission(s1.id, USER_ID);
      await db.assignSubmissionToQueue(s1.id, queue.id);

      const s2 = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(s2);
      await db.approveSubmission(s2.id, USER_ID);
      await db.assignSubmissionToQueue(s2.id, queue.id);

      const subs = await db.getQueueSubmissions(queue.id);
      assertEquals(subs.length, 2);
      assertEquals(subs[0].id, id1);
      assertEquals(subs[1].id, id2);
    });

    it("excludes posted submissions", async () => {
      const queue = await db.createQueue({ connectionId, name: "q", ...INTERVAL_PARAMS });
      assertExists(queue);

      const subId = await db.createSubmission(BROADCAST_ID, USER_ID, { text: "will be posted" });
      assertExists(subId);
      const claimed = await db.claimNextSubmission(BROADCAST_ID);
      assertExists(claimed);
      await db.approveSubmission(claimed.id, USER_ID);
      await db.assignSubmissionToQueue(subId, queue.id);
      await db.dequeueFromQueue(queue.id);

      const subs = await db.getQueueSubmissions(queue.id);
      assertEquals(subs.length, 0);
    });
  });
});
