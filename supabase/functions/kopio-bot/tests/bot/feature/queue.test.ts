import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand, privateMessage, callbackQuery } from "../../helpers/updates.ts";

const SUBMIT_ID    = -9_888_041;
const BROADCAST_ID = -9_888_042;
const MOD_ID       =  9_888_041;
const SUBMITTER_ID =  9_888_042;

const INTERVAL_PARAMS = {
  scheduleType: "interval" as const,
  timezone: "UTC",
  intervalMinutes: 60,
  startTime: "08:00:00",
  endTime: "23:00:00",
};

describe("queue feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM submissions WHERE broadcast_id = ${BROADCAST_ID}`;
      await conn.queryObject`DELETE FROM connection_roles WHERE user_id IN (${MOD_ID}, ${SUBMITTER_ID})`;
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + MOD_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + MOD_ID + "%"}`;
      await conn.queryObject`DELETE FROM connections WHERE submit_id = ${SUBMIT_ID}`;
      await conn.queryObject`DELETE FROM users WHERE id IN (${MOD_ID}, ${SUBMITTER_ID})`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  async function setupAdmin() {
    await db.coerceUser(MOD_ID);
    await db.coerceUser(SUBMITTER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    const connection = await db.getConnectionBySubmitId(SUBMIT_ID);
    assertExists(connection);
    await db.assignConnectionRole(MOD_ID, connection.id, "admin");
    return connection;
  }

  async function setupModerator() {
    await db.coerceUser(MOD_ID);
    await db.coerceUser(SUBMITTER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    const connection = await db.getConnectionBySubmitId(SUBMIT_ID);
    assertExists(connection);
    await db.assignConnectionRole(MOD_ID, connection.id, "moderator");
    return connection;
  }

  async function activateConnection() {
    await testBot.handleUpdate(
      privateCommand({ userId: MOD_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
  }

  async function enterModerateConvo() {
    await testBot.handleUpdate(
      callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "welcome:choose:review" }),
    );
  }

  describe("/newqueue", () => {
    it("requires admin — moderator is rejected", async () => {
      await setupModerator();
      await activateConnection();
      testBot.clearCalls();

      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "newqueue" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      const denied = sends.find((s) => (s.payload as { text: string }).text === "{queue.not-admin}");
      assertExists(denied);
    });

    it("creates an interval queue through the full conversation", async () => {
      await setupAdmin();
      await activateConnection();
      testBot.clearCalls();

      // Enter conversation
      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "newqueue" }));
      // Step 1: name
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "Morning Slot" }));
      // Step 2: schedule type → interval
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "newqueue:interval" }));
      // Step 3: interval minutes
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "60" }));
      // Start time
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "08:00" }));
      // End time
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "23:00" }));
      // Timezone
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "newqueue:tz:utc" }));
      // Days
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "newqueue:days:all" }));
      // Threshold
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "newqueue:thresh:5" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      const confirm = sends.find((s) => (s.payload as { text: string }).text === "{queue.created}");
      assertExists(confirm);

      const connection = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertExists(connection);
      const queues = await db.getQueuesForConnection(connection.id);
      assertEquals(queues.length, 1);
      assertEquals(queues[0].name, "Morning Slot");
      assertEquals(queues[0].schedule_type, "interval");
      assertEquals(queues[0].interval_minutes, 60);
    });

    it("rejects a duplicate name", async () => {
      const connection = await setupAdmin();
      await activateConnection();
      await db.createQueue({ connectionId: connection.id, name: "daily", ...INTERVAL_PARAMS });
      testBot.clearCalls();

      // Walk through the conversation to the point of queue creation
      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "newqueue" }));
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "daily" }));
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "newqueue:interval" }));
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "60" }));
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "08:00" }));
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "23:00" }));
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "newqueue:tz:utc" }));
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "newqueue:days:all" }));
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "newqueue:thresh:5" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      const err = sends.find((s) => (s.payload as { text: string }).text === "{queue.name-taken}");
      assertExists(err);
    });
  });

  describe("/queues", () => {
    it("replies with none message when no queues exist", async () => {
      await setupModerator();
      await activateConnection();
      testBot.clearCalls();

      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "queues" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      const none = sends.find((s) => (s.payload as { text: string }).text === "{queue.none}");
      assertExists(none);
    });

    it("lists queues when they exist", async () => {
      const connection = await setupModerator();
      await activateConnection();
      await db.createQueue({ connectionId: connection.id, name: "daily", ...INTERVAL_PARAMS });
      testBot.clearCalls();

      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "queues" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      const list = sends.find((s) =>
        (s.payload as { text: string }).text.includes("{queue.list-header}")
      );
      assertExists(list);
    });
  });

  describe("/deletequeue", () => {
    it("requires admin", async () => {
      const connection = await setupModerator();
      await activateConnection();
      await db.createQueue({ connectionId: connection.id, name: "daily", ...INTERVAL_PARAMS });
      testBot.clearCalls();

      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "deletequeue", payload: "daily" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      const denied = sends.find((s) => (s.payload as { text: string }).text === "{queue.not-admin}");
      assertExists(denied);
    });

    it("deletes an existing queue", async () => {
      const connection = await setupAdmin();
      await activateConnection();
      await db.createQueue({ connectionId: connection.id, name: "daily", ...INTERVAL_PARAMS });
      testBot.clearCalls();

      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "deletequeue", payload: "daily" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      const confirm = sends.find((s) => (s.payload as { text: string }).text === "{queue.deleted}");
      assertExists(confirm);

      const queues = await db.getQueuesForConnection(connection.id);
      assertEquals(queues.length, 0);
    });

    it("replies not-found for an unknown queue name", async () => {
      await setupAdmin();
      await activateConnection();
      testBot.clearCalls();

      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "deletequeue", payload: "nope" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      const err = sends.find((s) => (s.payload as { text: string }).text === "{queue.not-found}");
      assertExists(err);
    });
  });

  describe("approve with queue selection", () => {
    it("shows queue selection keyboard when queues exist", async () => {
      const connection = await setupModerator();
      await db.createQueue({ connectionId: connection.id, name: "daily", ...INTERVAL_PARAMS });
      await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Post me" });
      await activateConnection();
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:approve" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      const prompt = sends.find((s) => (s.payload as { text: string }).text === "{queue.select-prompt}");
      assertExists(prompt);

      const markup = (prompt.payload as { reply_markup?: { inline_keyboard: { callback_data: string }[][] } }).reply_markup;
      assertExists(markup);
      const buttons = markup.inline_keyboard.flat();
      const hasQueueBtn = buttons.some((b) => b.callback_data.startsWith("mod:queue:"));
      assertEquals(hasQueueBtn, true);
    });

    it("approves without queue selection when no queues exist", async () => {
      await setupModerator();
      await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Direct approve" });
      await activateConnection();
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:approve" }));

      const edit = testBot.calls.find((c) => c.method === "editMessageText");
      assertExists(edit);
      assertEquals(
        (edit.payload as { text: string }).text,
        "{moderate.submission-meta}\n\n{moderate.approved}",
      );
    });

    it("approves and assigns to queue when a queue is selected", async () => {
      const connection = await setupModerator();
      const queue = await db.createQueue({ connectionId: connection.id, name: "daily", ...INTERVAL_PARAMS });
      assertExists(queue);
      const subId = await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Queued post" });
      assertExists(subId);
      await activateConnection();
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:approve" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: `mod:queue:${queue.id}` }));

      const edit = testBot.calls.find((c) => c.method === "editMessageText");
      assertExists(edit);
      assertEquals(
        (edit.payload as { text: string }).text,
        "{moderate.submission-meta}\n\n{moderate.approved}",
      );

      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{ queue_id: string | null }>`
          SELECT queue_id FROM submissions WHERE id = ${subId}
        `;
        assertEquals(rows[0]?.queue_id, queue.id);
      } finally {
        conn.release();
      }
    });

    it("approves without queue assignment when 'no queue' is selected", async () => {
      const connection = await setupModerator();
      const queue = await db.createQueue({ connectionId: connection.id, name: "daily", ...INTERVAL_PARAMS });
      assertExists(queue);
      const subId = await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Unqueued post" });
      assertExists(subId);
      await activateConnection();
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:approve" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:queue:none" }));

      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{ queue_id: string | null; reviewed_by: number | null }>`
          SELECT queue_id, reviewed_by FROM submissions WHERE id = ${subId}
        `;
        assertEquals(rows[0]?.queue_id, null);
        assertExists(rows[0]?.reviewed_by);
      } finally {
        conn.release();
      }
    });
  });

  describe("/viewqueue", () => {
    async function makeQueueWithSubmissions(connectionId: string, texts: string[]) {
      const queue = await db.createQueue({ connectionId, name: "daily", ...INTERVAL_PARAMS });
      assertExists(queue);
      for (const text of texts) {
        const subId = await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text });
        assertExists(subId);
        const claimed = await db.claimNextSubmission(BROADCAST_ID);
        assertExists(claimed);
        await db.approveSubmission(claimed.id, MOD_ID);
        await db.assignSubmissionToQueue(subId, queue.id);
      }
      return queue;
    }

    it("shows unqueued submissions when no queue name is given", async () => {
      await setupModerator();
      await activateConnection();
      testBot.clearCalls();

      // No submissions → immediately done (no unqueued submissions exist)
      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "viewqueue" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "{queue.view-done}"));
    });

    it("replies not-found for an unknown queue name", async () => {
      await setupModerator();
      await activateConnection();
      testBot.clearCalls();

      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "viewqueue", payload: "nonexistent" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "{queue.not-found}"));
    });

    it("shows done immediately when the queue is empty", async () => {
      const connection = await setupModerator();
      await db.createQueue({ connectionId: connection.id, name: "daily", ...INTERVAL_PARAMS });
      await activateConnection();
      testBot.clearCalls();

      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "viewqueue", payload: "daily" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "{queue.view-done}"));
    });

    it("skip advances through submissions in FIFO order", async () => {
      const connection = await setupModerator();
      await makeQueueWithSubmissions(connection.id, ["alpha", "beta", "gamma"]);
      await activateConnection();
      testBot.clearCalls();

      // Enter — first submission shown
      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "viewqueue", payload: "daily" }));
      let sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "alpha"));
      testBot.clearCalls();

      // Skip → second submission shown (regression: was always showing first)
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "queue:skip" }));
      sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "beta"));
      testBot.clearCalls();

      // Skip → third submission shown
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "queue:skip" }));
      sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "gamma"));
      testBot.clearCalls();

      // Skip → done
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "queue:skip" }));
      sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "{queue.view-done}"));
    });

    it("exit ends the conversation without showing a done message", async () => {
      const connection = await setupModerator();
      await makeQueueWithSubmissions(connection.id, ["to review"]);
      await activateConnection();

      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "viewqueue", payload: "daily" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "queue:exit" }));

      const sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertEquals(sends.find((s) => (s.payload as { text: string }).text === "{queue.view-done}"), undefined);
    });

    it("edit saves and advances offset to the next submission", async () => {
      const connection = await setupModerator();
      await makeQueueWithSubmissions(connection.id, ["first", "second"]);
      await activateConnection();
      testBot.clearCalls();

      // Enter — first submission shown
      await testBot.handleUpdate(privateCommand({ userId: MOD_ID, command: "viewqueue", payload: "daily" }));
      let sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "first"));
      testBot.clearCalls();

      // Click edit
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "queue:edit" }));
      testBot.clearCalls();

      // Send replacement text
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "first edited" }));

      // After edit: edit-saved reply and second submission shown
      sends = testBot.calls.filter((c) => c.method === "sendMessage");
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "{queue.edit-saved}"));
      assertExists(sends.find((s) => (s.payload as { text: string }).text === "{queue.view-item}"));
    });
  });
});
