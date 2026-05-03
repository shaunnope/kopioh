import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertRejects } from "@std/assert";
import { silentDeleteTransformer } from "../../bot/context.ts";

const SUCCESS = { ok: true as const, result: true as true };

// deno-lint-ignore no-explicit-any
type AnyTransformer = (prev: any, method: any, payload: any) => Promise<any>;

const makeNext = (result: unknown = SUCCESS, throws?: Error) =>
  () => throws ? Promise.reject(throws) : Promise.resolve(result);

describe("silentDeleteTransformer", () => {
  it("passes non-deleteMessage calls through to prev", async () => {
    const expected = { ok: true as const, result: { message_id: 1 } };
    const t = silentDeleteTransformer() as AnyTransformer;
    const result = await t(makeNext(expected), "sendMessage", { chat_id: 1, text: "hi" });
    assertEquals(result, expected);
  });

  it("passes deleteMessage through when prev succeeds", async () => {
    const t = silentDeleteTransformer() as AnyTransformer;
    const result = await t(makeNext(), "deleteMessage", { chat_id: 1, message_id: 42 });
    assertEquals(result, SUCCESS);
  });

  it("swallows errors from deleteMessage and returns ok", async () => {
    const t = silentDeleteTransformer() as AnyTransformer;
    const error = new Error("not enough rights");
    const result = await t(makeNext(undefined, error), "deleteMessage", { chat_id: 1, message_id: 42 });
    assertEquals(result, SUCCESS);
  });

  it("calls onError with the caught error", async () => {
    const error = new Error("message not found");
    let captured: unknown;
    const t = silentDeleteTransformer((e) => { captured = e }) as AnyTransformer;
    await t(makeNext(undefined, error), "deleteMessage", { chat_id: 1, message_id: 42 });
    assertEquals(captured, error);
  });

  it("does not swallow errors from other methods", async () => {
    const t = silentDeleteTransformer() as AnyTransformer;
    const error = new Error("sendMessage failed");
    await assertRejects(
      () => t(makeNext(undefined, error), "sendMessage", { chat_id: 1, text: "hi" }),
      Error,
      "sendMessage failed",
    );
  });
});
