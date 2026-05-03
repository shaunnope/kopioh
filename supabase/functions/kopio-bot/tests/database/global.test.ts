import { describe, it, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists, assertStrictEquals } from "@std/assert";
import db from "../../database/index.ts";

const SUBMIT_ID = -9_888_020;
const BROADCAST_ID = -9_888_021;
const OTHER_SUBMIT_ID = -9_888_022;
const OTHER_BROADCAST_ID = -9_888_023;

describe("db global", () => {
  afterEach(async () => {
    await db.deleteConnection(SUBMIT_ID);
    await db.deleteConnection(OTHER_SUBMIT_ID);
    // ON DELETE SET NULL clears global_config.default_connection_id automatically
  });

  afterAll(() => db.pool.end());

  describe("getDefaultConnection", () => {
    it("returns null when no default is set", async () => {
      const result = await db.getDefaultConnection();
      assertEquals(result, null);
    });

    it("returns the connection after setDefaultConnection", async () => {
      const id = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      await db.setDefaultConnection(id!);

      const result = await db.getDefaultConnection();
      assertExists(result);
      assertEquals(result.id, id);
      assertEquals(Number(result.submitId), SUBMIT_ID);
      assertEquals(Number(result.broadcastId), BROADCAST_ID);
    });

    it("returns submitId and broadcastId as JS numbers, not BigInt", async () => {
      const id = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      await db.setDefaultConnection(id!);

      const result = await db.getDefaultConnection();
      assertExists(result);
      assertStrictEquals(typeof result.submitId, "number");
      assertStrictEquals(typeof result.broadcastId, "number");
    });

    it("returns null after the default connection is deleted", async () => {
      const id = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      await db.setDefaultConnection(id!);

      await db.deleteConnection(SUBMIT_ID);

      const result = await db.getDefaultConnection();
      assertEquals(result, null);
    });
  });

  describe("setDefaultConnection", () => {
    it("overwrites the previous default", async () => {
      const firstId = await db.createConnection(BROADCAST_ID, SUBMIT_ID);
      const secondId = await db.createConnection(OTHER_BROADCAST_ID, OTHER_SUBMIT_ID);
      await db.setDefaultConnection(firstId!);
      await db.setDefaultConnection(secondId!);

      const result = await db.getDefaultConnection();
      assertExists(result);
      assertEquals(result.id, secondId);
      assertEquals(Number(result.submitId), OTHER_SUBMIT_ID);
    });
  });
});
