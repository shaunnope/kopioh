import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../../database/index.ts";
import { encryptUserId } from "../../../database/crypto.ts";
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
      await conn.queryObject({ text: `DELETE FROM submissions WHERE created_by = $1`, args: [await encryptUserId(USER_ID)] });
      await conn.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
      // Clear conversation and session storage for this user between tests
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + USER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + USER_ID + "%"}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  it("prompts for content after selecting `submit` callback", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:submit" })); 

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    const prompt = sends.find(s =>
      (s.payload as { text: string }).text === "{submit.prompt}",
    );
    assertExists(prompt);
  });

  it("re-prompts when user sends a command instead of content", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:submit" })); 
    testBot.clearCalls();

    // Send a command — should be rejected
    await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "ping" }));

    const sends = testBot.calls.filter(c => c.method === "sendMessage")
    const prompt = sends.find(s =>
      (s.payload as { text: string }).text === "{submit.send-content}",
    )
    assertExists(prompt)
  })

  it("shows confirm/cancel keyboard after receiving content", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );

    await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:submit" })); 

    await testBot.handleUpdate(privateMessage({ userId: USER_ID, text: "My post content" }));

    const confirm = testBot.calls.find(c => (c.payload as { text: string}).text === "{submit.confirm-prompt}")
    assertExists(confirm)
    const markup = (confirm.payload as { reply_markup?: { inline_keyboard: { callback_data: string }[][] } }).reply_markup;
    assertExists(markup);
    const buttons = markup.inline_keyboard.flat();
    assertEquals(buttons.some(b => b.callback_data === "submit:confirm"), true);
    assertEquals(buttons.some(b => b.callback_data === "submit:cancel"), true);
  });

  it("creates a submission and confirms on confirm callback", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    // Step 1: connect + request submit
    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );

    await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:submit" }));

    // Step 2: send content
    await testBot.handleUpdate(privateMessage({ userId: USER_ID, text: "My post content" }));
    testBot.clearCalls();

    // Step 3: confirm
    await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "submit:confirm" }));

    const edits = testBot.calls.filter(c => c.method === "editMessageText")
    assertEquals(edits.length, 2)
    assertEquals((edits[0].payload as { text: string }).text, "{submit.prompt}")
    assertEquals((edits[1].payload as { text: string }).text, "{submit.success}")

    // Verify the submission was persisted
    const conn = await db.pool.connect();
    try {
      const { rows } = await conn.queryObject<{ broadcast_id: number; content: { text: string } }>({
        text: `SELECT broadcast_id, content FROM submissions WHERE created_by = $1 LIMIT 1`,
        args: [await encryptUserId(USER_ID)],
      });
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
    await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:submit" }));

    await testBot.handleUpdate(privateMessage({ userId: USER_ID, text: "Draft post" }));
    testBot.clearCalls();

    await testBot.handleUpdate(callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "submit:cancel" }));

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "{submit.cancelled}");

    // Verify nothing was persisted
    const conn = await db.pool.connect();
    try {
      const { rows } = await conn.queryObject({
        text: `SELECT id FROM submissions WHERE created_by = $1`,
        args: [await encryptUserId(USER_ID)],
      });
      assertEquals(rows.length, 0);
    } finally {
      conn.release();
    }
  });
});
