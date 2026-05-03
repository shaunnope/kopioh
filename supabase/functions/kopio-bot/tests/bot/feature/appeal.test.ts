import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot, type ApiCall } from "../../helpers/bot.ts";
import { privateCommand, privateMessage, callbackQuery } from "../../helpers/updates.ts";
import { config } from "../../../config.ts";

const SUBMIT_ID    = -9_888_080;
const BROADCAST_ID = -9_888_081;
const MOD_ID       =  9_888_080;
const SUBMITTER_ID =  9_888_081;
const OWNER_ID     = config.BOT_OWNER_ID;

describe("appeal feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM bans WHERE broadcast_id = ${BROADCAST_ID}`;
      await conn.queryObject`DELETE FROM warnings WHERE broadcast_id = ${BROADCAST_ID}`;
      await conn.queryObject`DELETE FROM submissions WHERE broadcast_id = ${BROADCAST_ID}`;
      await conn.queryObject`DELETE FROM connection_roles WHERE user_id IN (${MOD_ID}, ${SUBMITTER_ID})`;
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + MOD_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + MOD_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + SUBMITTER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + SUBMITTER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + OWNER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + OWNER_ID + "%"}`;
      await conn.queryObject`DELETE FROM connections WHERE submit_id = ${SUBMIT_ID}`;
      await conn.queryObject`DELETE FROM users WHERE id IN (${MOD_ID}, ${SUBMITTER_ID})`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  async function setup() {
    await db.coerceUser(MOD_ID);
    await db.coerceUser(SUBMITTER_ID);
    const connId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    assertExists(connId);
    await db.assignConnectionRole(MOD_ID, connId, "moderator");
  }

  /** Issues a warning directly and returns the warningId */
  async function issueWarning(reason?: string) {
    const result = await db.issueWarning(SUBMITTER_ID, BROADCAST_ID, null, reason ?? null);
    return result.warningId;
  }

  /** Extracts the appealId encoded in the owner's notification buttons */
  function extractAppealId(calls: ApiCall[]): string | null {
    const ownerMsg = calls.find(
      c => c.method === "sendMessage" &&
      Number((c.payload as { chat_id: number }).chat_id) === OWNER_ID,
    );
    if (!ownerMsg) return null;
    const markup = (ownerMsg.payload as {
      reply_markup?: { inline_keyboard: { callback_data: string }[][] };
    }).reply_markup;
    const button = markup?.inline_keyboard.flat().find(b => b.callback_data.startsWith("warn-appeal:lift:"));
    return button?.callback_data.split(":")[2] ?? null;
  }

  // ─── appeal submission flow ───────────────────────────────────────────────

  describe("user appeal flow", () => {
    it("prompts for a reason and sends appeal to owner", async () => {
      await setup();
      const warningId = await issueWarning("spam");
      testBot.clearCalls();

      await testBot.handleUpdate(
        callbackQuery({ userId: SUBMITTER_ID, chatId: SUBMITTER_ID, data: `warn:appeal:${warningId}` }),
      );
      await testBot.handleUpdate(
        privateMessage({ userId: SUBMITTER_ID, text: "I didn't break any rules" }),
      );

      // Submitter notified
      const sent = testBot.calls.find(
        c => c.method === "sendMessage" &&
        Number((c.payload as { chat_id: number }).chat_id) === SUBMITTER_ID &&
        (c.payload as { text: string }).text === "{warn-appeal.sent}",
      );
      assertExists(sent);

      // Owner notified with lift/reject buttons
      const ownerMsg = testBot.calls.find(
        c => c.method === "sendMessage" &&
        Number((c.payload as { chat_id: number }).chat_id) === OWNER_ID,
      );
      assertExists(ownerMsg);
      const markup = (ownerMsg.payload as { reply_markup?: { inline_keyboard: { callback_data: string }[][] } }).reply_markup;
      assertExists(markup);
      const buttons = markup!.inline_keyboard.flat();
      assertEquals(buttons.some(b => b.callback_data.startsWith("warn-appeal:lift:")), true);
      assertEquals(buttons.some(b => b.callback_data.startsWith("warn-appeal:reject:")), true);
    });

    it("blocks a duplicate appeal on the same warning", async () => {
      await setup();
      const warningId = await issueWarning();

      // First appeal
      await testBot.handleUpdate(
        callbackQuery({ userId: SUBMITTER_ID, chatId: SUBMITTER_ID, data: `warn:appeal:${warningId}` }),
      );
      await testBot.handleUpdate(
        privateMessage({ userId: SUBMITTER_ID, text: "first appeal" }),
      );
      testBot.clearCalls();

      // Second appeal on the same warning — already reply sent before any prompt
      await testBot.handleUpdate(
        callbackQuery({ userId: SUBMITTER_ID, chatId: SUBMITTER_ID, data: `warn:appeal:${warningId}` }),
      );

      const alreadySent = testBot.calls.find(
        c => c.method === "sendMessage" &&
        (c.payload as { text: string }).text === "{warn-appeal.already}",
      );
      assertExists(alreadySent);
    });
  });

  // ─── owner: lift appeal ───────────────────────────────────────────────────

  describe("owner lifts appeal", () => {
    it("removes the warning, lifts any ban, and notifies the submitter", async () => {
      await setup();
      const warningId = await issueWarning("bad content");

      // Submitter appeals
      await testBot.handleUpdate(
        callbackQuery({ userId: SUBMITTER_ID, chatId: SUBMITTER_ID, data: `warn:appeal:${warningId}` }),
      );
      await testBot.handleUpdate(
        privateMessage({ userId: SUBMITTER_ID, text: "I appeal this" }),
      );

      const appealId = extractAppealId(testBot.calls);
      assertExists(appealId);
      testBot.clearCalls();

      // Owner lifts
      await testBot.handleUpdate(
        callbackQuery({ userId: OWNER_ID, chatId: OWNER_ID, data: `warn-appeal:lift:${appealId}` }),
      );

      // Warning removed from DB
      assertEquals(await db.getUserWarningCount(SUBMITTER_ID, BROADCAST_ID), 0);

      // Submitter notified
      const notify = testBot.calls.find(
        c => c.method === "sendMessage" &&
        Number((c.payload as { chat_id: number }).chat_id) === SUBMITTER_ID &&
        (c.payload as { text: string }).text === "{warn-appeal.notify-lifted}",
      );
      assertExists(notify);

      // Owner's message updated
      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      assertEquals((edit.payload as { text: string }).text, "{warn-appeal-info.lifted}");
    });

    it("replies with appeal-expired when appeal is already resolved", async () => {
      await setup();
      const warningId = await issueWarning();

      await testBot.handleUpdate(
        callbackQuery({ userId: SUBMITTER_ID, chatId: SUBMITTER_ID, data: `warn:appeal:${warningId}` }),
      );
      await testBot.handleUpdate(
        privateMessage({ userId: SUBMITTER_ID, text: "please lift" }),
      );
      const appealId = extractAppealId(testBot.calls);
      assertExists(appealId);

      // Lift once
      await testBot.handleUpdate(
        callbackQuery({ userId: OWNER_ID, chatId: OWNER_ID, data: `warn-appeal:lift:${appealId}` }),
      );
      testBot.clearCalls();

      // Try to lift again
      await testBot.handleUpdate(
        callbackQuery({ userId: OWNER_ID, chatId: OWNER_ID, data: `warn-appeal:lift:${appealId}` }),
      );

      const expired = testBot.calls.find(
        c => c.method === "sendMessage" &&
        (c.payload as { text: string }).text === "{warn-appeal-info.expired}",
      );
      assertExists(expired);
    });
  });

  // ─── owner: reject appeal ─────────────────────────────────────────────────

  describe("owner rejects appeal", () => {
    it("prompts for rejection reason, stores it, and notifies the submitter", async () => {
      await setup();
      const warningId = await issueWarning("rule break");

      // Submitter appeals
      await testBot.handleUpdate(
        callbackQuery({ userId: SUBMITTER_ID, chatId: SUBMITTER_ID, data: `warn:appeal:${warningId}` }),
      );
      await testBot.handleUpdate(
        privateMessage({ userId: SUBMITTER_ID, text: "wasn't me" }),
      );
      const appealId = extractAppealId(testBot.calls);
      assertExists(appealId);
      testBot.clearCalls();

      // Owner rejects
      await testBot.handleUpdate(
        callbackQuery({ userId: OWNER_ID, chatId: OWNER_ID, data: `warn-appeal:reject:${appealId}` }),
      );
      // Owner enters rejection reason
      await testBot.handleUpdate(
        privateMessage({ userId: OWNER_ID, text: "Evidence is clear" }),
      );

      // Warning still exists
      assertEquals(await db.getUserWarningCount(SUBMITTER_ID, BROADCAST_ID), 1);

      // Submitter notified with rejection message
      const notify = testBot.calls.find(
        c => c.method === "sendMessage" &&
        Number((c.payload as { chat_id: number }).chat_id) === SUBMITTER_ID &&
        (c.payload as { text: string }).text === "{warn-appeal.notify-rejected}",
      );
      assertExists(notify);

      // Owner confirmation
      const confirm = testBot.calls.find(
        c => c.method === "sendMessage" &&
        Number((c.payload as { chat_id: number }).chat_id) === OWNER_ID &&
        (c.payload as { text: string }).text === "{warn-appeal-info.reject-success}",
      );
      assertExists(confirm);

      // Appeal stored as rejected
      const appeal = await db.getAppeal(appealId!);
      assertEquals(appeal!.status, "rejected");
      assertEquals(appeal!.rejectionReason, "Evidence is clear");
    });
  });
});
