import { describe, it, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists, assertStrictEquals } from "@std/assert";
import db from "../../database/index.ts";

const SUBMIT_ID = -9_888_010;
const BROADCAST_ID = -9_888_011;

describe("db connection", () => {
  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID)
  });

  afterAll(() => db.pool.end());

  describe("getConnectionBySubmitId", () => {
    it("returns null when not found", async () => {
      const result = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertEquals(result, null);
    });

    it("returns the connection row when found", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);

      const result = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertExists(result);
      assertEquals(Number(result.broadcast_id), BROADCAST_ID);
    });

    it("returns broadcast_id and submit_id as JS numbers, not BigInt", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);

      const result = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertExists(result);
      assertStrictEquals(typeof result.broadcast_id, "number");
      assertStrictEquals(typeof result.submit_id, "number");
    });
  });

  describe("createConnection", () => {
    it("creates a connection and returns its id", async () => {
      const id = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      assertExists(id);
    });

    it("returns null on duplicate (broadcast_id, submit_id)", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      const id = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      assertEquals(id, null);
    });
  });

  describe("deleteConnection", () => {
    it("returns false when no connection exists", async () => {
      const deleted = await db.deleteConnection(SUBMIT_ID);
      assertEquals(deleted, false);
    });

    it("returns true and removes the row", async () => {
      await db.createConnection(BROADCAST_ID, SUBMIT_ID);

      const deleted = await db.deleteConnection(SUBMIT_ID);
      assertEquals(deleted, true);

      const remaining = await db.getConnectionBySubmitId(SUBMIT_ID);
      assertEquals(remaining, null);
    });
  });
});
