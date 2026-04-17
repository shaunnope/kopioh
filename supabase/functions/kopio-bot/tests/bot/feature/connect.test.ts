import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot, BOT_ID } from "../../helpers/bot.ts";
import { groupCommand, channelPostForwarded, channelPost } from "../../helpers/updates.ts";

// Stable test IDs — unlikely to collide with real data
const SUBMIT_ID = -9_888_001;
const BROADCAST_ID = -9_888_002;
const USER_ID = 9_888_001;

describe("connect feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
  });

  afterAll(() => db.pool.end());

  describe("/connect command", () => {
    it("rejects non-creator", async () => {
      testBot.overrides.memberStatus = "member";
      await testBot.handleUpdate(groupCommand({ chatId: SUBMIT_ID, userId: USER_ID, command: "connect" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{connect.not-admin}");
    });

    it("sends payload message and edits with real message_id", async () => {
      await testBot.handleUpdate(groupCommand({ chatId: SUBMIT_ID, userId: USER_ID, command: "connect" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(send);
      assertExists(edit);

      // Initial send has placeholder message_id 0
      assertEquals((send.payload as { text: string }).text.includes(`[${SUBMIT_ID};0;${USER_ID}]`), true);
      // Edit replaces 0 with the real message_id
      const editText = (edit.payload as { text: string }).text;
      assertEquals(/\[-?\d+;\d+;\d+\]/.test(editText), true);
      assertEquals(editText.includes(";0;"), false);
    });

    it("rejects when already connected", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      testBot.clearCalls();

      await testBot.handleUpdate(groupCommand({ chatId: SUBMIT_ID, userId: USER_ID, command: "connect" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals(
        (send.payload as { text: string }).text,
        "{connect.already-connected}",
      );
    });
  });

  describe("/disconnect command", () => {
    it("rejects non-creator", async () => {
      testBot.overrides.memberStatus = "member";
      await testBot.handleUpdate(groupCommand({ chatId: SUBMIT_ID, userId: USER_ID, command: "disconnect" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{connect.not-admin}");
    });

    it("replies not-connected when no connection exists", async () => {
      await testBot.handleUpdate(groupCommand({ chatId: SUBMIT_ID, userId: USER_ID, command: "disconnect" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals(
        (send.payload as { text: string }).text,
        "{connect.not-connected}",
      );
    });

    it("deletes connection and confirms", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      testBot.clearCalls();

      await testBot.handleUpdate(groupCommand({ chatId: SUBMIT_ID, userId: USER_ID, command: "disconnect" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{connect.disconnected}");

      const remaining = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertEquals(remaining, null);
    });
  });

  describe("channel post handler", () => {
    it("ignores non-forwarded posts", async () => {
      await testBot.handleUpdate(channelPost({ chatId: BROADCAST_ID, text: `[${SUBMIT_ID};1]` }));
      assertEquals(testBot.calls.length, 0);
    });

    it("ignores posts forwarded from non-bot users", async () => {
      await testBot.handleUpdate(
        channelPostForwarded({ chatId: BROADCAST_ID, text: `[${SUBMIT_ID};1]`, fromBotId: 12345 }),
      );
      // fromBotId 12345 ≠ BOT_ID, so it should be ignored
      assertEquals(testBot.calls.filter(c => c.method === "sendMessage").length, 0);
    });

    it("replies invalid-message when payload is malformed", async () => {
      await testBot.handleUpdate(
        channelPostForwarded({ chatId: BROADCAST_ID, text: "no payload here", fromBotId: BOT_ID }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals(
        (send.payload as { text: string }).text,
        "{connect.invalid-message}",
      );
    });

    it("creates connection and confirms on valid payload", async () => {
      const originalMsgId = 42;
      await testBot.handleUpdate(
        channelPostForwarded({
          chatId: BROADCAST_ID,
          text: `🔗 Forward this message to a broadcast channel to connect it.\n[${SUBMIT_ID};${originalMsgId};${USER_ID}]`,
          fromBotId: BOT_ID,
        }),
      );

      const connection = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertExists(connection);
      assertEquals(Number(connection.broadcast_id), BROADCAST_ID);

      const successMsg = testBot.calls.find(
        c => c.method === "sendMessage" && (c.payload as { chat_id: number }).chat_id === SUBMIT_ID,
      );
      assertExists(successMsg);
      assertEquals((successMsg.payload as { text: string }).text, "{connect.success}");

      // Both messages should be deleted
      const deletes = testBot.calls.filter(c => c.method === "deleteMessage");
      assertEquals(deletes.length, 2);
    });
  });
});
