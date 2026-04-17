import { describe, it, beforeEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand, groupCommand } from "../../helpers/updates.ts";

const USER_ID  =  9_888_056;
const GROUP_ID = -9_888_056;

describe("unhandled handler", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterAll(() => db.pool.end());

  it("replies to an unknown command in a private chat", async () => {
    await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "totally_unknown_cmd_xyz" }));

    const send = testBot.calls.find(c => c.method === "sendMessage");
    assertExists(send);
    assertEquals((send.payload as { text: string }).text, "{unhandled.command}");
  });

  it("replies to an unknown command in a group chat", async () => {
    await testBot.handleUpdate(groupCommand({ chatId: GROUP_ID, userId: USER_ID, command: "totally_unknown_cmd_xyz" }));

    const send = testBot.calls.find(c => c.method === "sendMessage");
    assertExists(send);
    assertEquals((send.payload as { text: string }).text, "{unhandled.command}");
  });
});
