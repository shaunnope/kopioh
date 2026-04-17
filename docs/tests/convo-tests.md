# grammY Conversations v2 — Analysis & Unit Testing Plan

## Part 1: How the Plugin Works (Key Facts for Testers)

### The Replay Engine — The Core Mental Model

When a conversation is entered, it runs until the first `wait` call. The function is then interrupted. When the next update arrives, the entire function is **replayed from the start** — but API calls are skipped (no effects). As soon as the previously-reached wait point is hit again, execution resumes normally.

This means **every line of your conversation body can execute multiple times**. This is the single most important thing to understand when designing tests.

### The Golden Rule

Code that behaves differently between replays must be wrapped in `conversation.external`. This includes database reads/writes, `Math.random()`, `Date.now()`, and any API calls on independent `bot.api` instances. Regular `ctx.reply` and `ctx.api.*` calls do NOT need this — the plugin handles them automatically.

### Two Context Types

Outside context objects (used in middleware) have `ConversationFlavor` installed. Inside context objects (created by the plugin during replay) are completely independent — they don't have access to `ctx.conversation.enter` and don't have any plugins installed by default unless you pass them via the `plugins` array to `createConversation`.

### Session Access

The session plugin cannot be passed to the `plugins` array because it would read, then immediately write back the same data before the conversation even runs. Instead, sessions must be accessed via `conversation.external((ctx) => ctx.session)`.

### Parallel Conversations

By default each chat can only have one active conversation. With `{ parallel: true }`, multiple can run simultaneously. When parallel, unaccepted updates fall through to the middleware system rather than being dropped.

---

## Part 2: Unit Test Plan

The replay-engine architecture makes conversations notoriously tricky to test. The right approach is **testing through the bot's middleware stack**, not calling conversation functions directly. Here's the layered strategy:

---

### Layer 1 — Test Harness Setup

Build a reusable `createTestBot()` helper for every test suite:

```ts
import { Bot, Context } from "grammy";
import { conversations, createConversation, ConversationFlavor } from "@grammyjs/conversations";

type Ctx = ConversationFlavor<Context>;

function createTestBot(convoFn: Function, name: string) {
  const bot = new Bot<Ctx>("test-token", {
    botInfo: { id: 1, is_bot: true, first_name: "TestBot", username: "testbot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false },
  });

  // Capture outgoing API calls instead of hitting Telegram
  const sent: any[] = [];
  bot.api.config.use((prev, method, payload) => {
    sent.push({ method, payload });
    return { ok: true, result: { message_id: 1 } } as any;
  });

  bot.use(conversations());
  bot.use(createConversation(convoFn, name));

  return { bot, sent };
}

// Helper: build a minimal Telegram Update object
function makeTextUpdate(text: string, chatId = 1, userId = 100): Update {
  return {
    update_id: Math.floor(Math.random() * 1e9),
    message: {
      message_id: 1, date: 0,
      chat: { id: chatId, type: "private" },
      from: { id: userId, is_bot: false, first_name: "User" },
      text,
    },
  };
}
```

Because `conversations()` defaults to in-memory storage, **no database setup is needed for unit tests**. State persists within a single `Bot` instance across multiple `bot.handleUpdate()` calls.

---

### Layer 2 — Happy Path Tests (One scenario per conversation step)

Test the full turn-by-turn flow by sequentially calling `bot.handleUpdate()`.

```ts
describe("greetingConvo - happy path", () => {
  it("replies with welcome after receiving name", async () => {
    const { bot, sent } = createTestBot(greetingConvo, "greeting");

    // Turn 1: trigger entry
    await bot.handleUpdate(makeCommandUpdate("/enter"));
    expect(sent[0].method).toBe("sendMessage");
    expect(sent[0].payload.text).toContain("What is your name?");

    sent.length = 0; // clear captured calls

    // Turn 2: user sends name
    await bot.handleUpdate(makeTextUpdate("Alice"));
    expect(sent[0].payload.text).toContain("Welcome, Alice");
  });
});
```

**Key insight**: the `bot` instance carries in-memory conversation state between `handleUpdate` calls, so this accurately simulates the real replay lifecycle.

---

### Layer 3 — `otherwise` / Rejection Path Tests

For every `waitFor`, `waitForHears`, or `form.*` call that has an `otherwise` handler, test that invalid input triggers it and does **not** advance the conversation:

```ts
it("re-prompts when user sends a photo instead of text", async () => {
  const { bot, sent } = createTestBot(nameConvo, "name");
  await bot.handleUpdate(makeCommandUpdate("/enter")); // enter
  sent.length = 0;

  await bot.handleUpdate(makePhotoUpdate()); // wrong type
  expect(sent.some(s => s.payload.text?.includes("Please send text"))).toBe(true);

  sent.length = 0;
  await bot.handleUpdate(makeTextUpdate("Bob")); // now correct
  expect(sent[0].payload.text).toContain("Welcome, Bob");
});
```

---

### Layer 4 — `conversation.external` Tests (Side-Effect Isolation)

The replay engine only calls `external` once per logical execution, not once per replay. Verify this:

```ts
it("calls the database exactly once per conversation step, not per replay", async () => {
  let dbCallCount = 0;

  async function dbConvo(conversation: Conversation, ctx: Context) {
    const data = await conversation.external(async () => {
      dbCallCount++;
      return "some-value";
    });
    await ctx.reply(data);
    await conversation.wait();
  }

  const { bot } = createTestBot(dbConvo, "dbConvo");
  await bot.handleUpdate(makeCommandUpdate("/enter")); // enters, external runs once
  const countAfterTurn1 = dbCallCount;

  await bot.handleUpdate(makeTextUpdate("next")); // replays, external is SKIPPED
  expect(dbCallCount).toBe(countAfterTurn1); // must not have incremented
});
```

This directly validates the Golden Rule behavior.

---

### Layer 5 — Exit / Termination Tests

Test all three exit paths:

```ts
// 1. Natural return
it("exits when conversation function returns", async () => { ... });

// 2. conversation.halt()
it("exits when conversation.halt() is called", async () => { ... });

// 3. ctx.conversation.exit() from middleware
it("exits when exit() is called from outside middleware", async () => {
  const { bot, sent } = createTestBot(longConvo, "longConvo");
  await bot.handleUpdate(makeCommandUpdate("/enter")); // enter conversation
  await bot.handleUpdate(makeCommandUpdate("/cancel")); // triggers ctx.conversation.exit("longConvo")

  // Now send another update — it should NOT be handled by the convo
  sent.length = 0;
  await bot.handleUpdate(makeTextUpdate("hello"));
  expect(sent).toHaveLength(0); // or whatever the fallback does
});
```

---

### Layer 6 — Wait Timeout Tests

```ts
it("halts conversation when update arrives after maxMilliseconds", async () => {
  // Mock conversation.now() indirectly by using a real clock trick
  // OR: use conversation.external(() => Date.now()) in the convo and mock it
  const { bot, sent } = createTestBot(timedConvo, "timedConvo"); // convo has maxMillisecondsToWait: 1
  await bot.handleUpdate(makeCommandUpdate("/enter"));

  await new Promise(r => setTimeout(r, 10)); // wait past timeout

  await bot.handleUpdate(makeTextUpdate("too late"));
  // Conversation should have exited; update passes through to downstream middleware
});
```

---

### Layer 7 — Session Access Tests

```ts
it("reads and writes session via conversation.external correctly", async () => {
  const { bot, sent } = createBotWithSession(sessionConvo, "sessionConvo");

  await bot.handleUpdate(makeCommandUpdate("/enter"));
  // Verify session was read exactly once (not once per replay)
  // Verify session write lands correctly after conversation completes
});
```

---

### Layer 8 — Parallel Conversation Tests

```ts
describe("parallel conversations", () => {
  it("allows two instances of the same conversation to run in the same chat", async () => {
    // Enter convo twice for the same chat
    await bot.handleUpdate(makeCommandUpdate("/enter")); // instance 1
    await bot.handleUpdate(makeCommandUpdate("/enter")); // instance 2
    expect(/* ctx.conversation.active("convo") */).toBe(2);
  });

  it("routes update to the correct instance based on filters", async () => {
    // user 42 and user 43 each start a captcha convo
    // update from user 42 should only resolve user 42's wait
  });
});
```

---

### Layer 9 — Form Field Tests

`conversation.form.*` methods internally use `waitFor` + `otherwise`. Test each field type you use:

```ts
it("form.int() rejects non-numeric input and accepts valid integer", async () => {
  const { bot, sent } = createTestBot(intFormConvo, "intForm");
  await bot.handleUpdate(makeCommandUpdate("/enter")); // prompts for number

  await bot.handleUpdate(makeTextUpdate("not a number")); // should re-prompt
  expect(sent.some(s => s.payload.text?.includes("Please send a number"))).toBe(true);

  await bot.handleUpdate(makeTextUpdate("42")); // accepted
  expect(/* final reply */);
});
```

---

## Part 3 — What NOT To Do

| Anti-pattern | Why it fails |
|---|---|
| Calling the conversation function directly as `await myConvo(mockConversation, mockCtx)` | The `Conversation` handle is internally wired to the replay engine — you can't meaningfully mock it |
| Asserting on raw `ctx.reply` calls via spies on a real `Context` | Inside-context objects are created fresh by the plugin; they're not the same object you passed in |
| Forgetting to intercept `bot.api` calls | Without the API interceptor, tests will attempt real HTTP calls to Telegram |
| Sharing a single `bot` instance across unrelated test cases | In-memory state leaks between tests; create a fresh bot per test |

---

## Summary

The fundamental test pattern is: **one bot instance per test → sequence of `bot.handleUpdate()` calls → assertions on captured API calls**. This tests the full replay lifecycle without mocking any internals. The Golden Rule (`conversation.external`) and the two-context-type system are the two architectural features that require the most deliberate test coverage.