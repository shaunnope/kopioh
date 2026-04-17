import { describe, it, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import db from "../../database/index.ts";

const STORAGE_TABLE = "bot_sessions";
const STORAGE_KEY = "db_test_storage_key";

describe("db.createStorageAdapter", () => {
  const adapter = db.createStorageAdapter<{ count: number }>(STORAGE_TABLE);

  afterEach(async () => {
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM bot_sessions WHERE key = ${STORAGE_KEY}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  it("read returns undefined for a missing key", async () => {
    const value = await adapter.read(STORAGE_KEY);
    assertEquals(value, undefined);
  });

  it("write then read returns the stored value", async () => {
    await adapter.write(STORAGE_KEY, { count: 42 });
    const value = await adapter.read(STORAGE_KEY);
    assertEquals(value, { count: 42 });
  });

  it("write overwrites an existing value", async () => {
    await adapter.write(STORAGE_KEY, { count: 1 });
    await adapter.write(STORAGE_KEY, { count: 99 });
    const value = await adapter.read(STORAGE_KEY);
    assertEquals(value, { count: 99 });
  });

  it("delete removes the key", async () => {
    await adapter.write(STORAGE_KEY, { count: 1 });
    await adapter.delete(STORAGE_KEY);
    const value = await adapter.read(STORAGE_KEY);
    assertEquals(value, undefined);
  });

  it("delete is a no-op for a missing key", async () => {
    await adapter.delete(STORAGE_KEY); // should not throw
  });
});
