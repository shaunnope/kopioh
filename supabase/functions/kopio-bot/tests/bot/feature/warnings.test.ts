import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand } from "../../helpers/updates.ts";

const SUBMIT_ID    = -9_888_070;
const BROADCAST_ID = -9_888_071;
const ADMIN_ID     =  9_888_070;
const USER_ID      =  9_888_071;

describe("warnings feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM warnings WHERE user_id IN (${ADMIN_ID}, ${USER_ID})`;
      await conn.queryObject`DELETE FROM bans WHERE user_id IN (${ADMIN_ID}, ${USER_ID})`;
      await conn.queryObject`DELETE FROM connection_roles WHERE user_id IN (${ADMIN_ID}, ${USER_ID})`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + ADMIN_ID + "%"}`;
      await conn.queryObject`DELETE FROM connections WHERE submit_id = ${SUBMIT_ID}`;
      await conn.queryObject`DELETE FROM users WHERE id IN (${ADMIN_ID}, ${USER_ID})`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  async function setupAdmin() {
    await db.coerceUser(ADMIN_ID);
    await db.coerceUser(USER_ID);
    const connId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    assertExists(connId);
    await db.assignConnectionRole(ADMIN_ID, connId!, "admin");
    await testBot.handleUpdate(
      privateCommand({ userId: ADMIN_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();
    return connId!;
  }

  async function setupModerator() {
    await db.coerceUser(ADMIN_ID);
    const connId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    assertExists(connId);
    await db.assignConnectionRole(ADMIN_ID, connId!, "moderator");
    await testBot.handleUpdate(
      privateCommand({ userId: ADMIN_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();
    return connId!;
  }

  describe("/warnings (self)", () => {
    it("shows no-warnings message when user has no warnings", async () => {
      await setupAdmin();
      await testBot.handleUpdate(privateCommand({ userId: ADMIN_ID, command: "warnings" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      const text = (send.payload as { text: string }).text;
      assertStringIncludes(text, "{warnings.none}");
    });

    it("shows warning list when user has warnings", async () => {
      await setupAdmin();
      await db.issueWarning(ADMIN_ID, BROADCAST_ID, null, "test reason");
      await testBot.handleUpdate(privateCommand({ userId: ADMIN_ID, command: "warnings" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      const text = (send.payload as { text: string }).text;
      assertStringIncludes(text, `{warnings} ${ADMIN_ID} [${ADMIN_ID}]`);
      assertStringIncludes(text, "test reason");
    });

    it("moderator can view own warnings", async () => {
      await setupModerator();
      await testBot.handleUpdate(privateCommand({ userId: ADMIN_ID, command: "warnings" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertStringIncludes((send.payload as { text: string }).text, "{warnings.none}");
    });
  });

  describe("/warnings <user_id> (admin lookup)", () => {
    it("shows target user's warnings for an admin", async () => {
      await setupAdmin();
      await db.issueWarning(USER_ID, BROADCAST_ID, null, "spam");
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "warnings", payload: String(USER_ID) }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      const text = (send.payload as { text: string }).text;
      assertStringIncludes(text, `{warnings} ${USER_ID} [${USER_ID}]`);
      assertStringIncludes(text, "spam");
    });

    it("shows no-warnings for user with clean record", async () => {
      await setupAdmin();
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "warnings", payload: String(USER_ID) }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertStringIncludes((send.payload as { text: string }).text, "{warnings.none}");
    });

    it("rejects non-admin looking up another user", async () => {
      await setupModerator();
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "warnings", payload: String(USER_ID) }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{warnings.not-admin}");
    });

    it("shows usage when argument is not a number", async () => {
      await setupAdmin();
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "warnings", payload: "abc" }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals(
        (send.payload as { text: string }).text,
        "{command-help.usage}: {command-warnings.usage}",
      );
    });

    it("includes pending appeal status in warning entries", async () => {
      await setupAdmin();
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null, "spam");
      await db.createAppeal(result.warningId, USER_ID, "I didn't do it");
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "warnings", payload: String(USER_ID) }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertStringIncludes(
        (send.payload as { text: string }).text,
        "{warnings.appeal-pending}",
      );
    });

    it("includes rejection reason when appeal is rejected", async () => {
      await setupAdmin();
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null, "spam");
      await db.createAppeal(result.warningId, USER_ID, "I didn't do it");
      await db.rejectAppeal(result.warningId, "Evidence confirmed");
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "warnings", payload: String(USER_ID) }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertStringIncludes(
        (send.payload as { text: string }).text,
        "{warnings.appeal-rejected-reason}",
      );
    });
  });
});
