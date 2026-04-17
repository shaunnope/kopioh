import { describe, it, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import db from "../../database/index.ts";

const USER_ID = 9_888_010;

describe("db.coerceUser", () => {
  afterEach(async () => {
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
    } finally {
      conn.release();
    }
  });

  afterAll(() => db.pool.end());

  it("inserts a new user", async () => {
    await db.coerceUser(USER_ID);

    const conn = await db.pool.connect();
    try {
      const { rows } = await conn.queryObject<{ id: number }>`
        SELECT id FROM users WHERE id = ${USER_ID}
      `;
      assertEquals(Number(rows[0]?.id), USER_ID);
    } finally {
      conn.release();
    }
  });

  it("is idempotent on conflict", async () => {
    await db.coerceUser(USER_ID);
    await db.coerceUser(USER_ID); // should not throw
  });
});
