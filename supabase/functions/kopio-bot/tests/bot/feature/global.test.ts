import { describe, it, beforeEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { callbackQuery } from "../../helpers/updates.ts";

const USER_ID = 9_888_053;

describe("global feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterAll(() => db.pool.end());

  describe("g:cancel callback", () => {
    it("edits message to cancelled text and answers the callback", async () => {
      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "g:cancel" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      assertEquals((edit.payload as { text: string }).text, "{command.cancelled}");
      assertExists(testBot.calls.find(c => c.method === "answerCallbackQuery"));
    });

    it("works when invoked multiple times in a row", async () => {
      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "g:cancel" }));
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "g:cancel" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      assertEquals((edit.payload as { text: string }).text, "{command.cancelled}");
    });
  });
});
