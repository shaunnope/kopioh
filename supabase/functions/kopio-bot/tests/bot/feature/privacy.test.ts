import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand, callbackQuery } from "../../helpers/updates.ts";

const SUBMIT_ID    = -9_888_060;
const BROADCAST_ID = -9_888_061;
const USER_ID      =  9_888_060;

describe("privacy feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM submissions WHERE broadcast_id = ${BROADCAST_ID}`;
      await conn.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + USER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + USER_ID + "%"}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  describe("/getdata command", () => {
    it("replies with privacy summary and action buttons", async () => {
      await db.coerceUser(USER_ID);

      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "getdata" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{privacy.summary}");

      const buttons = (
        send.payload as { reply_markup: { inline_keyboard: { callback_data: string }[][] } }
      ).reply_markup.inline_keyboard.flat();
      assertEquals(buttons.some(b => b.callback_data === "privacy:unlink"), true);
      assertEquals(buttons.some(b => b.callback_data === "privacy:deleteall"), true);
      assertEquals(buttons.some(b => b.callback_data === "g:cancel"), true);
    });

    it("works when user has no prior submissions", async () => {
      await db.coerceUser(USER_ID);

      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "getdata" }));

      assertExists(testBot.calls.find(c => c.method === "sendMessage"));
    });
  });

  describe("privacy:unlink flow", () => {
    it("shows confirmation prompt on privacy:unlink", async () => {
      await db.coerceUser(USER_ID);

      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "getdata" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "privacy:unlink" }));

      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{privacy.unlink-prompt}"));
      const buttons = (
        sends[0].payload as { reply_markup: { inline_keyboard: { callback_data: string }[][] } }
      ).reply_markup.inline_keyboard.flat();
      assertEquals(buttons.some(b => b.callback_data === "privacy:unlink:confirm"), true);
    });

    it("anonymizes submissions and replies success on privacy:unlink:confirm", async () => {
      await db.coerceUser(USER_ID);
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      await db.createSubmission(BROADCAST_ID, USER_ID, { text: "Test post" });

      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "getdata" }));
      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "privacy:unlink" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "privacy:unlink:confirm" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      assertEquals((edit.payload as { text: string }).text, "{privacy.unlink-success}");
    });
  });

  describe("privacy:deleteall flow", () => {
    it("shows deleteall confirmation prompt", async () => {
      await db.coerceUser(USER_ID);

      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "getdata" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "privacy:deleteall" }));

      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{privacy.deleteall-prompt}"));
      const buttons = (
        sends[0].payload as { reply_markup: { inline_keyboard: { callback_data: string }[][] } }
      ).reply_markup.inline_keyboard.flat();
      assertEquals(buttons.some(b => b.callback_data === "privacy:deleteall:confirm"), true);
    });

    it("deletes all user data and replies success on privacy:deleteall:confirm", async () => {
      await db.coerceUser(USER_ID);

      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "getdata" }));
      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "privacy:deleteall" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "privacy:deleteall:confirm" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      assertEquals((edit.payload as { text: string }).text, "{privacy.deleteall-success}");
    });
  });
});
