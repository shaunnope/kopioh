import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { ApiCall, createTestBot } from "../../helpers/bot.ts";
import { privateCommand } from "../../helpers/updates.ts";
import { config } from "../../../config.ts";

const SUBMIT_ID    = -9_888_058;
const BROADCAST_ID = -9_888_059;
const OWNER_ID     = config.BOT_OWNER_ID;
const NON_OWNER_ID =  9_888_058;

function assertIsUnhandled(calls: ApiCall[]) {
  const sends = calls.filter(c => c.method === "sendMessage")
  assertEquals(sends.length, 1)
  assertEquals(sends[0].payload.text, "{unhandled.command}")
}

describe("admin feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    // setMyCommands is not in the default mock — override it so admin tests don't throw
    testBot = createTestBot(undefined, { setMyCommands: true });
  });

  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + OWNER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + OWNER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + NON_OWNER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + NON_OWNER_ID + "%"}`;
      // Nullify FK references before deleting — OWNER_ID is the real bot owner and may
      // already have submissions in the test DB with reviewed_by pointing at them.
      // Nullify/remove all FK dependents before deleting users.
      // OWNER_ID is the real bot owner and may have pre-existing rows in these tables.
      await conn.queryObject`UPDATE submissions SET reviewed_by = NULL WHERE reviewed_by IN (${OWNER_ID}, ${NON_OWNER_ID})`;
      await conn.queryObject`DELETE FROM warnings WHERE user_id IN (${OWNER_ID}, ${NON_OWNER_ID})`;
      await conn.queryObject`DELETE FROM whispers WHERE created_by IN (${OWNER_ID}, ${NON_OWNER_ID})`;
      await conn.queryObject`DELETE FROM connection_roles WHERE user_id IN (${OWNER_ID}, ${NON_OWNER_ID})`;
      await conn.queryObject`DELETE FROM users WHERE id IN (${OWNER_ID}, ${NON_OWNER_ID})`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  describe("/setcommands", () => {
    it("processed by unhandled handler for non-owner users", async () => {
      await testBot.handleUpdate(privateCommand({ userId: NON_OWNER_ID, command: "setcommands" }));

      assertIsUnhandled(testBot.calls)
    });

    it("calls setMyCommands and replies success for the bot owner", async () => {
      await testBot.handleUpdate(privateCommand({ userId: OWNER_ID, command: "setcommands" }));

      assertExists(testBot.calls.find(c => c.method === "setMyCommands"));
      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{admin.commands-updated}"));
    });
  });

  describe("/setdefault", () => {
    it("is silently ignored for non-owner users", async () => {
      await testBot.handleUpdate(privateCommand({ userId: NON_OWNER_ID, command: "setdefault" }));

      assertIsUnhandled(testBot.calls)
    });

    it("replies no-connection when owner has no active session connection", async () => {
      await testBot.handleUpdate(privateCommand({ userId: OWNER_ID, command: "setdefault" }));

      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{admin.setdefault-no-connection}"));
    });

    it("sets the default connection and replies success when owner has an active session", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);

      // Establish a session connection via /start deep-link
      await testBot.handleUpdate(
        privateCommand({ userId: OWNER_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      testBot.clearCalls();

      await testBot.handleUpdate(privateCommand({ userId: OWNER_ID, command: "setdefault" }));

      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{admin.setdefault-success}"));

      // Verify the default was persisted in the DB
      const defaultConn = await db.getDefaultConnection();
      const connection = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertEquals(defaultConn?.id, connection?.id);
    });
  });
});
