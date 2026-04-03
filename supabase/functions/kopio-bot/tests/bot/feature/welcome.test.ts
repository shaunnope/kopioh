import { describe, it, beforeEach, afterEach, afterAll } from "jsr:@std/testing/bdd";
import { FakeTime } from "jsr:@std/testing/time";
import { assertEquals, assertExists } from "jsr:@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand, groupCommand } from "../../helpers/updates.ts";

const SUBMIT_ID = -9_888_003;
const BROADCAST_ID = -9_888_004;
const USER_ID = 9_888_002;

describe("welcome feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
  });

  afterAll(() => db.pool.end());

  describe("/start in private chat", () => {
    it("replies with welcome when no payload", async () => {
      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "start" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      // Just verify a reply was sent — welcome text is locale-defined
      assertExists((send.payload as { text: string }).text);
    });

    it("replies with welcome when submitId has no connection", async () => {
      await testBot.handleUpdate(
        privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
    });

    it("replies with submit_ready when submitId has a connection", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      testBot.clearCalls();

      await testBot.handleUpdate(
        privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "👋🏻 Hi there! You're all set to submit a post.");
    });
  });

  describe("/start in group chat", () => {
    it("sends a help message with inline keyboard and deletes the command", async () => {
      using time = new FakeTime();

      await testBot.handleUpdate(groupCommand({ chatId: SUBMIT_ID, userId: USER_ID, command: "start" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);

      const replyMarkup = (send.payload as { reply_markup?: { inline_keyboard: unknown[][] } }).reply_markup;
      assertExists(replyMarkup);
      assertEquals(replyMarkup.inline_keyboard.length > 0, true);

      const del = testBot.calls.find(c => c.method === "deleteMessage");
      assertExists(del);

      await time.tickAsync(5_000);
    });
  });
});
