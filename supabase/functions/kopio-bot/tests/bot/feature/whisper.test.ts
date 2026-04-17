import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists, assertFalse } from "@std/assert";
import db from "../../../database/index.ts";
import { createTestBot } from "../../helpers/bot.ts";
import { privateCommand, privateMessage, callbackQuery } from "../../helpers/updates.ts";

const SUBMIT_ID = -9_888_013;
const BROADCAST_ID = -9_888_014;
const USER_ID = 9_888_009;

function cleanup() {
  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM whispers WHERE created_by = ${USER_ID}`;
      await conn.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
      await conn.queryObject`DELETE FROM bot_conversations WHERE key LIKE ${"%" + USER_ID + "%"}`;
      await conn.queryObject`DELETE FROM bot_sessions WHERE key LIKE ${"%" + USER_ID + "%"}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());
}

describe("whisperConvo", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });
  
  cleanup()

  it("replies disabled when whisper_limit is 0", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.setWhisperLimit(connectionId!, 0);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:whisper" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text.includes("disabled")));
  });

  it("replies rate_limited when user has exhausted their limit", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.setWhisperLimit(connectionId!, 1);
    await db.setWhisperPeriodMinutes(connectionId!, 60);
    await db.createWhisper(USER_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:whisper" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text === "{whisper.rate_limited}"));
  });

  it("sends prompt with cancel button when limit is not reached", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:whisper" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    const prompt = sends.find(s =>
      (s.payload as { text: string }).text === "{whisper.prompt}",
    );
    assertExists(prompt);

    const buttons = (
      prompt!.payload as { reply_markup: { inline_keyboard: { callback_data: string }[][] } }
    ).reply_markup.inline_keyboard.flat();
    assertEquals(buttons.some(b => b.callback_data === "whisper:cancel"), true);
  });

  it("cancels when user clicks cancel at the prompt", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:whisper" }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "whisper:cancel" }),
    );

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "{command.cancelled}");
  });

  it("re-prompts when user sends a command instead of content", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:whisper" }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "ping" }));
    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text === "{submit.send-content}"));
  });

  it("re-prompts when user sends a disallowed content type", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    // Default whisper_allowed_types is ["text"]; send a photo to trigger rejection

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:whisper" }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate({
      update_id: 9001,
      message: {
        message_id: 9001,
        date: Math.floor(Date.now() / 1000),
        chat: { id: USER_ID, type: "private", first_name: "Tester" },
        from: { id: USER_ID, is_bot: false, first_name: "Tester" },
        photo: [{ file_id: "abc", file_unique_id: "abc", width: 100, height: 100, file_size: 100 }],
      },
    });
    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text === "{submit.type-not-allowed}"));
  });

  it("shows confirm/cancel keyboard after receiving valid content", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:whisper" }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(privateMessage({ userId: USER_ID, text: "Hello anonymous world" }));

    const menus = testBot.calls.filter(c =>
      c.method === "sendMessage" &&
      (c.payload as { reply_markup?: unknown }).reply_markup !== undefined,
    );
    assertExists(menus[1])
    const buttons = (
      menus[1].payload as { reply_markup: { inline_keyboard: { callback_data: string }[][] } }
    ).reply_markup.inline_keyboard.flat();
    assertEquals(buttons.some(b => b.callback_data === "whisper:confirm"), true);
    assertEquals(buttons.some(b => b.callback_data === "whisper:cancel"), true);
  });

  it("cancels at confirmation step without posting", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:whisper" }),
    );
    await testBot.handleUpdate(privateMessage({ userId: USER_ID, text: "Hello anonymous world" }));
    testBot.clearCalls();

    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "whisper:cancel" }),
    );

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "{command.cancelled}");

    const conn = await db.pool.connect();
    try {
      const { rows } = await conn.queryObject`SELECT id FROM whispers WHERE created_by = ${USER_ID}`;
      assertEquals(rows.length, 0);
    } finally {
      conn.release();
    }
  });

  it("sends whisper to group and records it in DB on confirm", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "welcome:choose:whisper" }),
    );
    await testBot.handleUpdate(privateMessage({ userId: USER_ID, text: "Hello anonymous world" }));
    testBot.clearCalls();

    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "whisper:confirm" }),
    );

    const groupSends = testBot.calls.filter(
      c => c.method === "sendMessage" && Number((c.payload as { chat_id: number }).chat_id) === SUBMIT_ID,
    );
    assertEquals(groupSends.length > 0, true);

    const edit = testBot.calls.find(c => c.method === "editMessageText");
    assertExists(edit);
    assertEquals((edit.payload as { text: string }).text, "{whisper.success}");

    const conn = await db.pool.connect();
    try {
      const { rows } = await conn.queryObject`SELECT id FROM whispers WHERE created_by = ${USER_ID}`;
      assertEquals(rows.length, 1);
    } finally {
      conn.release();
    }
  });
});

describe("stale whisper callbacks", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });
  
  cleanup()

  it("removes keyboard on stale whisper:confirm", async () => {
    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "whisper:confirm" }),
    );

    assertExists(testBot.calls.find(c => c.method === "editMessageReplyMarkup"));
  });

  it("removes keyboard on stale whisper:cancel", async () => {
    await testBot.handleUpdate(
      callbackQuery({ userId: USER_ID, chatId: USER_ID, data: "whisper:cancel" }),
    );

    assertExists(testBot.calls.find(c => c.method === "editMessageReplyMarkup"));
  });
});

describe("/setwhisper command", () => {
  let testBot: ReturnType<typeof createTestBot>;

  beforeEach(() => {
    testBot = createTestBot();
  });
  
  cleanup()

  it("replies no_connection when user has no active connection", async () => {
    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "3 1h" }),
    );
    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text === "{connect.no-connection}"));
  });

  it("replies with usage when no args given", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(privateCommand({ userId: USER_ID, command: "setwhisper" }));

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text.includes("/setwhisper")));
  });

  it("replies with usage when too many args given", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "3 1h extra" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text.includes("/setwhisper")));
  });

  it("replies not-admin when user lacks admin role", async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    // No role assigned — user is not admin

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "3 1h" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text === "{setwhisper.not-admin}"));
  });

  it("replies invalid_limit for non-integer limit", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "abc 1h" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text === "{setwhisper.invalid-limit}"));
  });

  it("replies invalid_limit when limit exceeds 100", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "101 1h" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text === "{setwhisper.invalid-limit}"));
  });

  it("replies invalid period for unrecognised format", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "3 xyz" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text.includes("Invalid period")));
  });

  it("replies period-too-long when period exceeds 3 months", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "3 4m" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text === "{setwhisper.period-too-long}"));
  });

  it("sets limit to 0 (disables whispers) and replies success", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "0" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    assertExists(sends.find(s => (s.payload as { text: string }).text === "{setwhisper.success}"));

    const cfg = await db.getConnectionConfig(connectionId!);
    assertEquals(cfg.whisper_limit, 0);
  });

  it("sets limit and period and replies success", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "5 2h" }),
    );

    const sends = testBot.calls.filter(c => c.method === "sendMessage");
    const msg = sends.find(s => (s.payload as { text: string }).text === "{setwhisper.success}");
    assertExists(msg);

    const cfg = await db.getConnectionConfig(connectionId!);
    assertEquals(cfg.whisper_limit, 5);
    assertEquals(cfg.whisper_period_minutes, 120);
  });

  it("defaults period to 60 minutes when period arg is omitted", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "3" }),
    );

    const cfg = await db.getConnectionConfig(connectionId!);
    assertEquals(cfg.whisper_limit, 3);
    assertEquals(cfg.whisper_period_minutes, 60);
  });

  it("treats period without unit as minutes", async () => {
    await db.coerceUser(USER_ID);
    const connectionId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
    await db.assignConnectionRole(USER_ID, connectionId!, "admin");

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "start", payload: String(SUBMIT_ID) }),
    );
    testBot.clearCalls();

    await testBot.handleUpdate(
      privateCommand({ userId: USER_ID, command: "setwhisper", payload: "2 30" }),
    );

    const cfg = await db.getConnectionConfig(connectionId!);
    assertEquals(cfg.whisper_limit, 2);
    assertEquals(cfg.whisper_period_minutes, 30);
  });
});
