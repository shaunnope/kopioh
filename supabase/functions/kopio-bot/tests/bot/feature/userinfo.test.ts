import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import {
  privateCommand,
  callbackQuery,
  forwardedUserMessage,
  forwardedHiddenMessage,
} from "../../helpers/updates.ts";

const SUBMIT_ID    = -9_888_060;
const BROADCAST_ID = -9_888_061;
const ADMIN_ID     =  9_888_060;
const SUBMITTER_ID =  9_888_061;

describe("userinfo feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM warnings WHERE user_id IN (${ADMIN_ID}, ${SUBMITTER_ID})`;
      await conn.queryObject`DELETE FROM bans WHERE user_id IN (${ADMIN_ID}, ${SUBMITTER_ID})`;
      await conn.queryObject`DELETE FROM submissions WHERE broadcast_id = ${BROADCAST_ID}`;
      await conn.queryObject`DELETE FROM connection_roles WHERE user_id IN (${ADMIN_ID}, ${SUBMITTER_ID})`;
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + ADMIN_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + ADMIN_ID + "%"}`;
      await conn.queryObject`DELETE FROM connections WHERE submit_id = ${SUBMIT_ID}`;
      await conn.queryObject`DELETE FROM users WHERE id IN (${ADMIN_ID}, ${SUBMITTER_ID})`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  async function setupAdminDb() {
    await db.coerceUser(ADMIN_ID);
    await db.coerceUser(SUBMITTER_ID);
    const connId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    assertExists(connId);
    await db.assignConnectionRole(ADMIN_ID, connId, "admin");
    return connId!;
  }

  async function setupAdmin() {
    const connId = await setupAdminDb();
    await testBot.handleUpdate(
      privateCommand({ userId: ADMIN_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();
    return connId;
  }

  async function enterModerateConvo() {
    await testBot.handleUpdate(
      privateCommand({ userId: ADMIN_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(
      callbackQuery({ userId: ADMIN_ID, chatId: ADMIN_ID, data: "welcome:choose:review" }),
    );
  }

  // --- /userinfo command ---

  describe("/userinfo command", () => {
    it("replies with usage when no argument is given", async () => {
      await setupAdmin();
      await testBot.handleUpdate(privateCommand({ userId: ADMIN_ID, command: "userinfo" }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{command-help.usage}: {command-userinfo.usage}");
    });

    it("replies with usage when argument is not a number", async () => {
      await setupAdmin();
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "userinfo", payload: "abc" }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{command-help.usage}: {command-userinfo.usage}");
    });

    it("replies with user info card for a valid user ID", async () => {
      await setupAdmin();
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "userinfo", payload: String(SUBMITTER_ID) }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      // Card header contains the user ID placeholder
      const text = (send.payload as { text: string }).text;
      assertExists(text);
      assertStringIncludes(text, `{userinfo.header} ${SUBMITTER_ID} [${SUBMITTER_ID}]`);
    });

    it("is blocked for a moderator (non-admin)", async () => {
      await db.coerceUser(ADMIN_ID);
      const connId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      assertExists(connId);
      await db.assignConnectionRole(ADMIN_ID, connId, "moderator");
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      testBot.clearCalls();

      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "userinfo", payload: String(SUBMITTER_ID) }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{userinfo.not-admin}");
    });
  });

  // --- Forwarded message handler ---

  describe("forwarded message handler", () => {
    it("replies with forward-hidden for a hidden_user forward", async () => {
      await setupAdmin();
      await testBot.handleUpdate(forwardedHiddenMessage({ userId: ADMIN_ID }));

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{userinfo.forward-hidden}");
    });

    it("replies with user info card for a user-type forward", async () => {
      await setupAdmin();
      await testBot.handleUpdate(
        forwardedUserMessage({ userId: ADMIN_ID, forwardedFromId: SUBMITTER_ID }),
      );

      const send = testBot.calls.find(c => 
        c.method === "sendMessage" && 
        (c.payload as { text: string }).text.includes(`{userinfo.header} ${SUBMITTER_ID} [${SUBMITTER_ID}]`)
      );
      assertExists(send);
    });

    it("is blocked for non-admin", async () => {
      await db.coerceUser(ADMIN_ID);
      const connId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      assertExists(connId);
      await db.assignConnectionRole(ADMIN_ID, connId, "moderator");
      await testBot.handleUpdate(
        privateCommand({ userId: ADMIN_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      testBot.clearCalls();

      await testBot.handleUpdate(
        forwardedUserMessage({ userId: ADMIN_ID, forwardedFromId: SUBMITTER_ID }),
      );

      const send = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(send);
      assertEquals((send.payload as { text: string }).text, "{userinfo.not-admin}");
    });
  });

  // --- mod:userinfo button in moderateConvo ---

  describe("mod:userinfo in moderateConvo", () => {
    it("shows the user info card and stays in the conversation", async () => {
      await setupAdminDb();
      await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "test post" });
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(
        callbackQuery({ userId: ADMIN_ID, chatId: ADMIN_ID, data: "mod:userinfo" }),
      );

      const send = testBot.calls.find(c => 
        c.method === "sendMessage" && 
        (c.payload as { text: string }).text?.includes(`{userinfo.header} ${SUBMITTER_ID} [${SUBMITTER_ID}]`)
      );
      assertExists(send);

      // Conversation should still be active — a follow-up exit should be handled
      testBot.clearCalls();
      await testBot.handleUpdate(
        callbackQuery({ userId: ADMIN_ID, chatId: ADMIN_ID, data: "mod:exit" }),
      );
      const exitSend = testBot.calls.find(c => c.method === "sendMessage");
      assertExists(exitSend);
    });
  });
});
