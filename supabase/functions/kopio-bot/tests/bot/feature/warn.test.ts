import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { WARN_THRESHOLD_TEMP } from "../../../database/warning.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand, privateMessage, callbackQuery } from "../../helpers/updates.ts";

const SUBMIT_ID    = -9_888_042;
const BROADCAST_ID = -9_888_043;
const MOD_ID       =  9_888_031;
const SUBMITTER_ID =  9_888_032;

describe("warn feature", () => {
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
      await conn.queryObject`DELETE FROM connection_config WHERE connection_id IN (SELECT id FROM connections WHERE submit_id = ${SUBMIT_ID})`;
      await conn.queryObject`DELETE FROM connections WHERE submit_id = ${SUBMIT_ID}`;
      await conn.queryObject`DELETE FROM users WHERE id IN (${MOD_ID}, ${SUBMITTER_ID})`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  async function setupModerator() {
    await db.coerceUser(MOD_ID);
    await db.coerceUser(SUBMITTER_ID);
    const id = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    assertExists(id);
    await db.assignConnectionRole(MOD_ID, id!, "moderator");
  }

  async function enterModerateConvo() {
    await testBot.handleUpdate(
      privateCommand({ userId: MOD_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(
      callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "welcome:choose:review" }),
    );
  }

  describe("reject & warn action", () => {
    it("issues a warning and appends warn line to the review message", async () => {
      await setupModerator();
      await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Bad post" });
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:reject-warn" }));
      // Skip the reason prompt
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:skip-reason" }));

      const count = await db.getUserWarningCount(SUBMITTER_ID, BROADCAST_ID);
      assertEquals(count, 1);

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      const text = (edit.payload as { text: string }).text;
      assertEquals(text, "{moderate.submission-meta}\n\n{moderate.rejected}\n{warn.issued}");
    });

    it("issues a warning with reason when reason text is sent", async () => {
      await setupModerator();
      await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Bad post" });
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:reject-warn" }));
      await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "Inappropriate content" }));

      const count = await db.getUserWarningCount(SUBMITTER_ID, BROADCAST_ID);
      assertEquals(count, 1);

      // DM should be sent to submitter
      const dm = testBot.calls.find(
        c => c.method === "sendMessage" && Number((c.payload as { chat_id: number }).chat_id) === SUBMITTER_ID,
      );
      assertExists(dm);
      assertEquals((dm.payload as { text: string }).text, "{warn.notify-issued}");
    });

    it("sends a DM to the submitter when warning is issued (skip reason)", async () => {
      await setupModerator();
      await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Bad post" });
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:reject-warn" }));
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:skip-reason" }));

      const dm = testBot.calls.find(
        c => c.method === "sendMessage" && Number((c.payload as { chat_id: number }).chat_id) === SUBMITTER_ID,
      );
      assertExists(dm);
      assertEquals((dm.payload as { text: string }).text, "{warn.notify-issued}");
      // DM should include an appeal button
      const markup = (dm.payload as { reply_markup?: { inline_keyboard: { callback_data: string }[][] } }).reply_markup;
      assertExists(markup);
      assertEquals(markup!.inline_keyboard.flat().some(b => b.callback_data.startsWith("warn:appeal:")), true);
    });

    it("shows temp-ban line when warnings reach WARN_THRESHOLD_TEMP", async () => {
      await setupModerator();
      for (let i = 0; i < WARN_THRESHOLD_TEMP - 1; i++) {
        await db.issueWarning(SUBMITTER_ID, BROADCAST_ID, null);
      }

      await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Last straw" });
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:reject-warn" }));
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:skip-reason" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      assertEquals((edit.payload as { text: string }).text.includes("{warn.banned-temp}"), true);
      assertEquals(await db.isUserBanned(SUBMITTER_ID, BROADCAST_ID), true);

      // DM should report temp ban
      const dm = testBot.calls.find(
        c => c.method === "sendMessage" && Number((c.payload as { chat_id: number }).chat_id) === SUBMITTER_ID,
      );
      assertExists(dm);
      assertEquals((dm.payload as { text: string }).text, "{warn.notify-temp}");
    });


    it("uses custom thresholds from connection config", async () => {
      await setupModerator();
      const connection = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertExists(connection);
      // Set temp ban threshold to 2
      await db.setWarnThresholdTemp(connection!.id, 2);
      await db.setWarnThresholdPerm(connection!.id, 4);

      // Issue 1 warning so the next one triggers the temp ban
      await db.issueWarning(SUBMITTER_ID, BROADCAST_ID, null);

      await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Second strike" });
      await enterModerateConvo();
      testBot.clearCalls();

      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:reject-warn" }));
      await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:skip-reason" }));

      const edit = testBot.calls.find(c => c.method === "editMessageText");
      assertExists(edit);
      assertEquals((edit.payload as { text: string }).text.includes("{warn.banned-temp}"), true);
      assertEquals(await db.isUserBanned(SUBMITTER_ID, BROADCAST_ID), true);
    });
  });

  describe("banned user submit flow", () => {
    beforeEach(async () => {
      await db.coerceUser(SUBMITTER_ID);
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      for (let i = 0; i < WARN_THRESHOLD_TEMP; i++) {
        await db.issueWarning(SUBMITTER_ID, BROADCAST_ID, null);
      }
    });

    it("replies with temp-ban message instead of submit prompt", async () => {
      await testBot.handleUpdate(
        privateCommand({ userId: SUBMITTER_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      await testBot.handleUpdate(
        callbackQuery({ userId: SUBMITTER_ID, chatId: SUBMITTER_ID, data: "welcome:choose:submit" }),
      );

      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{warn.submit-banned-temp}"));
      assertEquals(sends.find(s => (s.payload as { text: string }).text === "{submit.prompt}"), undefined);
    });

    it("allows submission after ban is lifted", async () => {
      await db.liftBan(SUBMITTER_ID, BROADCAST_ID);

      await testBot.handleUpdate(
        privateCommand({ userId: SUBMITTER_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      await testBot.handleUpdate(
        callbackQuery({ userId: SUBMITTER_ID, chatId: SUBMITTER_ID, data: "welcome:choose:submit" }),
      );

      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{submit.prompt}"));
    });
  });

  describe("/unwarn command", () => {
    it("removes 1 warning and replies with success", async () => {
      await setupModerator();
      await db.issueWarning(SUBMITTER_ID, BROADCAST_ID, null);
      await db.issueWarning(SUBMITTER_ID, BROADCAST_ID, null);

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      testBot.clearCalls();

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "unwarn", payload: String(SUBMITTER_ID) }),
      );

      assertEquals(await db.getUserWarningCount(SUBMITTER_ID, BROADCAST_ID), 1);
      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{warn.remove-success}"));
    });

    it("replies with remove-none when user has no warnings", async () => {
      await setupModerator();

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      testBot.clearCalls();

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "unwarn", payload: String(SUBMITTER_ID) }),
      );

      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{warn.remove-none}"));
    });

    it("replies with invalid-id when no argument is given", async () => {
      await setupModerator();

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      testBot.clearCalls();

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "unwarn" }),
      );

      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{warn.unwarn-invalid-id}"));
    });
  });

  describe("/clearwarns command", () => {
    it("removes all warnings and replies with success", async () => {
      await setupModerator();
      await db.issueWarning(SUBMITTER_ID, BROADCAST_ID, null);
      await db.issueWarning(SUBMITTER_ID, BROADCAST_ID, null);
      await db.issueWarning(SUBMITTER_ID, BROADCAST_ID, null);

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      testBot.clearCalls();

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "clearwarns", payload: String(SUBMITTER_ID) }),
      );

      assertEquals(await db.getUserWarningCount(SUBMITTER_ID, BROADCAST_ID), 0);
      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{warn.remove-success}"));
    });

    it("replies with remove-none when user has no warnings", async () => {
      await setupModerator();

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "start", payload: String(SUBMIT_ID) }),
      );
      testBot.clearCalls();

      await testBot.handleUpdate(
        privateCommand({ userId: MOD_ID, command: "clearwarns", payload: String(SUBMITTER_ID) }),
      );

      const sends = testBot.calls.filter(c => c.method === "sendMessage");
      assertExists(sends.find(s => (s.payload as { text: string }).text === "{warn.remove-none}"));
    });
  });
});
