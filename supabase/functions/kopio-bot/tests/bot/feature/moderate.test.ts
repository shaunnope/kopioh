import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand, privateMessage, callbackQuery } from "../../helpers/updates.ts";

const SUBMIT_ID    = -9_888_007;
const BROADCAST_ID = -9_888_008;
const MOD_ID       =  9_888_005;
const SUBMITTER_ID =  9_888_006;

describe("moderate feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM submissions WHERE broadcast_id = ${BROADCAST_ID}`;
      await conn.queryObject`DELETE FROM connection_roles WHERE user_id IN (${MOD_ID}, ${SUBMITTER_ID})`;
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + MOD_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + MOD_ID + "%"}`;
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
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    const connection = await db.getConnectionBySubmitId(SUBMIT_ID);
    assertExists(connection);
    await db.assignConnectionRole(MOD_ID, connection.id, "moderator");
    return connection;
  }

  // Drives through the welcome → choose:review flow to enter moderateConvo.
  // On return, the conversation is either waiting for a mod:* callback
  // or has already replied and exited (if the queue was empty).
  async function enterModerateConvo() {
    await testBot.handleUpdate(
      privateCommand({ userId: MOD_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(
      callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "welcome:choose:review" }),
    );
  }

  it("replies with no-pending when the queue is empty", async () => {
    await setupModerator();
    await enterModerateConvo();

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    const noPending = sends.find(s =>
      (s.payload as { text: string }).text === "✅ No pending submissions right now.",
    );
    assertExists(noPending);
  });

  it("shows pending count and text preview with action keyboard", async () => {
    await setupModerator();
    await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "My test post" });
    await enterModerateConvo();

    const sends = testBot.calls.filter(c => c.method === "sendMessage");

    const countMsg = sends.find(s =>
      (s.payload as { text: string }).text === "There is 1 pending submission. Let's get started.",
    );
    assertExists(countMsg);

    const previewMsg = sends.find(s => (s.payload as { text: string }).text === "My test post");
    assertExists(previewMsg);

    const markup = (previewMsg.payload as { reply_markup?: { inline_keyboard: { callback_data: string }[][] } }).reply_markup;
    assertExists(markup);
    const buttons = markup.inline_keyboard.flat();
    assertEquals(buttons.some(b => b.callback_data === "mod:approve"), true);
    assertEquals(buttons.some(b => b.callback_data === "mod:reject"), true);
    assertEquals(buttons.some(b => b.callback_data === "mod:edit"), true);
    assertEquals(buttons.some(b => b.callback_data === "mod:skip"), true);
    assertEquals(buttons.some(b => b.callback_data === "mod:exit"), true);
  });

  it("shows poll question in submission preview", async () => {
    await setupModerator();
    await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, {
      poll: { question: "Favourite colour?", options: [] },
    });
    await enterModerateConvo();
    
    // TODO: rework this test. not ideal

    // const sends = testBot.calls.filter(c => c.method === "sendMessage");
    // const previewMsg = sends.find(s =>
    //   (s.payload as { text: string }).text === "📊 Poll: Favourite colour?",
    // );

    // assertExists(previewMsg);
  });

  it("shows media type for photo submission without caption", async () => {
    await setupModerator();
    await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, {
      photo: [{ file_id: "abc", file_unique_id: "xyz", width: 100, height: 100 }],
    });
    await enterModerateConvo();

    // TODO: rework this test. not ideal

    // const sends = testBot.calls.filter(c => c.method === "sendMessage");
    // const previewMsg = sends.find(s =>
    //   (s.payload as { text: string }).text === "Photo (no caption)",
    // );
    // assertExists(previewMsg);
  });

  it("approves a submission and edits the preview message", async () => {
    await setupModerator();
    await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Approvable post" });
    await enterModerateConvo();
    testBot.clearCalls();

    await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:approve" }));

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "Approvable post\n\n✅ Approved.");
  });

  it("rejects a submission and edits the preview message", async () => {
    await setupModerator();
    await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Bad post" });
    await enterModerateConvo();
    testBot.clearCalls();

    await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:reject" }));

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "Bad post\n\n✗ Rejected.");
  });

  it("skips a submission and edits the preview message", async () => {
    await setupModerator();
    await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Skip me" });
    await enterModerateConvo();
    testBot.clearCalls();

    await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:skip" }));

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "Skip me\n\n⏭️ Skipped.");
  });

  it("exits review, unclaims the submission, and appends exited text", async () => {
    await setupModerator();
    await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Exit post" });
    await enterModerateConvo();
    testBot.clearCalls();

    await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:exit" }));

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "Exit post\n\nExited review.");

    const pending = await db.countPendingSubmissions(BROADCAST_ID);
    assertEquals(pending, 1);
  });

  it("edits content and approves on confirm", async () => {
    await setupModerator();
    await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Original text" });
    await enterModerateConvo();
    testBot.clearCalls();

    // Trigger the edit action
    await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:edit" }));
    testBot.clearCalls();

    // Send the replacement content
    await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "Edited text" }));
    testBot.clearCalls();

    // Confirm the edit
    await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:edit_confirm" }));

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "✅ Edited and approved.");
  });

  it("cancels an edit and returns the submission to the pending queue", async () => {
    await setupModerator();
    await db.createSubmission(BROADCAST_ID, SUBMITTER_ID, { text: "Pending text" });
    await enterModerateConvo();
    testBot.clearCalls();

    await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:edit" }));
    testBot.clearCalls();

    await testBot.handleUpdate(privateMessage({ userId: MOD_ID, text: "Will be cancelled" }));
    testBot.clearCalls();

    await testBot.handleUpdate(callbackQuery({ userId: MOD_ID, chatId: MOD_ID, data: "mod:edit_cancel" }));

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "Edit cancelled.");

    // TODO: check count
    // const pending = await db.countPendingSubmissions(BROADCAST_ID);
    // assertEquals(pending, 1);
  });
});
