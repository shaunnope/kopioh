import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand, privateMessage, callbackQuery } from "../../helpers/updates.ts";

const SUBMIT_ID = -9_888_005;
const BROADCAST_ID = -9_888_006;
const USER_ID = 9_888_003;

describe("submit feature", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });

  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM submissions WHERE created_by = ${USER_ID}`;
      await conn.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
      // Clear conversation and session storage for this user between tests
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + USER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + USER_ID + "%"}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  it("prompts for content after /start with a valid connection", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );

    const send = testBot.calls.find(c => c.method === "sendMessage");
    assertExists(send);
    assertEquals(
      (send.payload as { text: string }).text,
      "What would you like to submit? Send me a message or poll.",
    );
  });

  it("re-prompts when user sends a command instead of content", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    // Send a command — should be rejected
    await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "ping" }));

    const send = testBot.calls.find(c => c.method === "sendMessage");
    assertExists(send);
    assertEquals(
      (send.payload as { text: string }).text,
      "Please send a message or poll, not a command.",
    );
  });

  it("shows confirm/cancel keyboard after receiving content", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(privateMessage({ userId: USER_ID, text: "My post content" }));

    const send = testBot.calls.find(c => c.method === "sendMessage");
    assertExists(send);
    const markup = (send.payload as { reply_markup?: { inline_keyboard: { callback_data: string }[][] } }).reply_markup;
    assertExists(markup);
    const buttons = markup.inline_keyboard.flat();
    assertEquals(buttons.some(b => b.callback_data === "submit:confirm"), true);
    assertEquals(buttons.some(b => b.callback_data === "submit:cancel"), true);
  });

  it("creates a submission and confirms on confirm callback", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    // Step 1: enter conversation
    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );

    // Step 2: send content
    await testBot.handleUpdate(privateMessage({ userId: USER_ID, text: "My post content" }));
    testBot.clearCalls();

    // Step 3: confirm
    await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "submit:confirm" }));

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "✅ Your submission is now under review.");

    // Verify the submission was persisted
    const conn = await db.pool.connect();
    try {
      const { rows } = await conn.queryObject<{ broadcast_id: number; content: { text: string } }>`
        SELECT broadcast_id, content FROM submissions WHERE created_by = ${USER_ID} LIMIT 1
      `;
      assertExists(rows[0]);
      assertEquals(Number(rows[0].broadcast_id), BROADCAST_ID);
      assertEquals(rows[0].content.text, "My post content");
    } finally {
      conn.release();
    }
  });

  it("cancels and edits message on cancel callback", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(privateMessage({ userId: USER_ID, text: "Draft post" }));
    testBot.clearCalls();

    await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "submit:cancel" }));

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "Submission cancelled.");

    // Verify nothing was persisted
    const conn = await db.pool.connect();
    try {
      const { rows } = await conn.queryObject`
        SELECT id FROM submissions WHERE created_by = ${USER_ID}
      `;
      assertEquals(rows.length, 0);
    } finally {
      conn.release();
    }
  });
});
