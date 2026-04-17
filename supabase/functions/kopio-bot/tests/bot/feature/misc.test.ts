import { describe, it, beforeEach, afterAll } from "@std/testing/bdd";
import { assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand, groupCommand } from "../../helpers/updates.ts";

const USER_ID  =  9_888_054;
const GROUP_ID = -9_888_054;

describe("misc feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterAll(() => db.pool.end());

  describe("/ping command", () => {
    it("sends an initial message and then edits it with latency info", async () => {
      await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "ping" }));

      assertExists(testBot.calls.find(c => c.method === "sendMessage"));
      assertExists(testBot.calls.find(c => c.method === "editMessageText"));
    });

    it("works in a group chat", async () => {
      await testBot.handleUpdate(groupCommand({ chatId: GROUP_ID, userId: USER_ID, command: "ping" }));

      assertExists(testBot.calls.find(c => c.method === "sendMessage"));
      assertExists(testBot.calls.find(c => c.method === "editMessageText"));
    });
  });
});
