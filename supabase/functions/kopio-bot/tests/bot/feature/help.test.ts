import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot, BOT_USERNAME } from "../../helpers/bot.ts";
import { privateCommand, groupCommand, callbackQuery } from "../../helpers/updates.ts";

const SUBMIT_ID    = -9_888_050;
const BROADCAST_ID = -9_888_051;
const GROUP_ID     = -9_888_052;
const USER_ID      =  9_888_050;

describe("help feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + USER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + USER_ID + "%"}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  describe("/help in private chat", () => {
    it("sends help intro with section keyboard", async () => {
      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "help" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{help-intro}");
      const markup = (send.payload as { reply_markup?: { inline_keyboard: unknown[][] } }).reply_markup;
      assertExists(markup);
      assertEquals(markup.inline_keyboard.length > 0, true);
    });
  });

  describe("help section callbacks", () => {
    it("shows submit section and back button on help:section:submit", async () => {
      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "help" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "help:section:submit" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      const markup = (edit.payload as { reply_markup?: { inline_keyboard: { callback_data: string }[][] } }).reply_markup;
      assertExists(markup);
      assertEquals(markup.inline_keyboard.flat().some(b => b.callback_data === "help:back"), true);
    });

    it("shows moderate section on help:section:moderate", async () => {
      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "help" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "help:section:moderate" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
    });

    it("shows queues section on help:section:queues", async () => {
      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "help" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "help:section:queues" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
    });

    it("shows privacy section on help:section:privacy", async () => {
      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "help" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "help:section:privacy" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
    });

    it("returns to intro with section keyboard on help:back", async () => {
      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "help" }));
      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "help:section:submit" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "help:back" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      assertEquals((edit.payload as { text: string }).text, "{help-intro}");
      const markup = (edit.payload as { reply_markup?: { inline_keyboard: unknown[][] } }).reply_markup;
      assertExists(markup);
      assertEquals(markup.inline_keyboard.length > 0, true);
    });
  });

  describe("/help in group chat", () => {
    it("sends redirect message with bot URL button", async () => {
      await testBot.handleUpdate(groupCommand({ chatId: GROUP_ID, userId: USER_ID, command: "help" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{help.group-redirect}");
      const markup = (send.payload as { reply_markup?: { inline_keyboard: { url?: string }[][] } }).reply_markup;
      assertExists(markup);
      assertEquals(markup.inline_keyboard.flat().some(b => b.url?.includes(BOT_USERNAME)), true);
    });

    it("sends redirect for a registered group too", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);

      await testBot.handleUpdate(groupCommand({ chatId: SUBMIT_ID, userId: USER_ID, command: "help" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{help.group-redirect}");
    });
  });
});
