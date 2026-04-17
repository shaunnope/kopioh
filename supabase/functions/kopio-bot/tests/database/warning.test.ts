import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists } from "@std/assert";
import db from "../../database/index.ts";
import { WARN_THRESHOLD_TEMP, WARN_THRESHOLD_PERM, TEMP_BAN_DAYS } from "../../database/warning.ts";

const SUBMIT_ID    = -9_888_040;
const BROADCAST_ID = -9_888_041;
const USER_ID      =  9_888_030;

describe("db warnings", () => {
  beforeEach(async () => {
    await db.coerceUser(USER_ID);
    await db.createConnection(BROADCAST_ID, SUBMIT_ID);
  });

  afterEach(async () => {
    const conn = await db.pool.connect();
    try {
      await conn.queryObject`DELETE FROM bans WHERE user_id = ${USER_ID}`;
      await conn.queryObject`DELETE FROM warnings WHERE user_id = ${USER_ID}`;
    } finally {
      conn.release();
    }
    await db.deleteConnection(SUBMIT_ID);
    const conn2 = await db.pool.connect();
    try {
      await conn2.queryObject`DELETE FROM users WHERE id = ${USER_ID}`;
    } finally {
      conn2.release();
    }
  });

  afterAll(() => db.pool.end());

  describe("getUserWarningCount", () => {
    it("returns 0 with no warnings", async () => {
      const count = await db.getUserWarningCount(USER_ID, BROADCAST_ID);
      assertEquals(count, 0);
    });

    it("returns the correct count after warnings are issued", async () => {
      await db.issueWarning(USER_ID, BROADCAST_ID, null);
      await db.issueWarning(USER_ID, BROADCAST_ID, null);
      const count = await db.getUserWarningCount(USER_ID, BROADCAST_ID);
      assertEquals(count, 2);
    });
  });

  describe("isUserBanned", () => {
    it("returns false with no bans", async () => {
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), false);
    });

    it("returns true after a temporary ban is issued", async () => {
      for (let i = 0; i < WARN_THRESHOLD_TEMP; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), true);
    });

    it("returns true after a permanent ban is issued", async () => {
      for (let i = 0; i < WARN_THRESHOLD_PERM; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), true);
    });

    it("returns false for an expired temporary ban", async () => {
      const conn = await db.pool.connect();
      try {
        await conn.queryObject({
          text: `INSERT INTO bans (user_id, broadcast_id, expires_at) VALUES ($1, $2, NOW() - INTERVAL '1 second')`,
          args: [USER_ID, BROADCAST_ID],
        });
      } finally {
        conn.release();
      }
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), false);
    });
  });

  describe("issueWarning", () => {
    it("returns incremented count and no ban below threshold", async () => {
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null);
      assertEquals(result.count, 1);
      assertEquals(result.banned, false);
      assertEquals(result.permanent, false);
    });

    it("issues a temporary ban at WARN_THRESHOLD_TEMP", async () => {
      for (let i = 0; i < WARN_THRESHOLD_TEMP - 1; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null);
      assertEquals(result.count, WARN_THRESHOLD_TEMP);
      assertEquals(result.banned, true);
      assertEquals(result.permanent, false);
      assertExists(result.expiresAt);
      const daysUntilExpiry = (result.expiresAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      assertEquals(daysUntilExpiry > TEMP_BAN_DAYS - 1, true);
    });

    it("upgrades to a permanent ban at WARN_THRESHOLD_PERM", async () => {
      for (let i = 0; i < WARN_THRESHOLD_PERM - 1; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null);
      assertEquals(result.count, WARN_THRESHOLD_PERM);
      assertEquals(result.banned, true);
      assertEquals(result.permanent, true);
      assertEquals(result.expiresAt, null);
    });

    it("stores the reason when provided", async () => {
      await db.issueWarning(USER_ID, BROADCAST_ID, null, "Spam");
      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{ reason: string | null }>({
          text: `SELECT reason FROM warnings WHERE user_id = $1 AND broadcast_id = $2 ORDER BY created_at DESC LIMIT 1`,
          args: [USER_ID, BROADCAST_ID],
        });
        assertEquals(rows[0]?.reason, "Spam");
      } finally {
        conn.release();
      }
    });

    it("stores null reason when not provided", async () => {
      await db.issueWarning(USER_ID, BROADCAST_ID, null);
      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{ reason: string | null }>({
          text: `SELECT reason FROM warnings WHERE user_id = $1 AND broadcast_id = $2 ORDER BY created_at DESC LIMIT 1`,
          args: [USER_ID, BROADCAST_ID],
        });
        assertEquals(rows[0]?.reason, null);
      } finally {
        conn.release();
      }
    });

    it("issues temp ban at custom threshold", async () => {
      const thresholds = { warnThresholdTemp: 2, warnThresholdPerm: 4, tempBanDays: 3 };
      await db.issueWarning(USER_ID, BROADCAST_ID, null, null, thresholds);
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null, null, thresholds);
      assertEquals(result.count, 2);
      assertEquals(result.banned, true);
      assertEquals(result.permanent, false);
      assertExists(result.expiresAt);
      const daysUntilExpiry = (result.expiresAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      assertEquals(daysUntilExpiry > 2, true);
    });

    it("issues perm ban at custom threshold", async () => {
      const thresholds = { warnThresholdTemp: 2, warnThresholdPerm: 4, tempBanDays: 3 };
      for (let i = 0; i < 3; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null, null, thresholds);
      }
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null, null, thresholds);
      assertEquals(result.count, 4);
      assertEquals(result.banned, true);
      assertEquals(result.permanent, true);
    });
  });

  describe("getBanStatus", () => {
    it("returns null when not banned", async () => {
      assertEquals(await db.getBanStatus(USER_ID, BROADCAST_ID), null);
    });

    it("returns expiresAt for a temporary ban", async () => {
      for (let i = 0; i < WARN_THRESHOLD_TEMP; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      const status = await db.getBanStatus(USER_ID, BROADCAST_ID);
      assertExists(status);
      assertExists(status!.expiresAt);
    });

    it("returns expiresAt as null for a permanent ban", async () => {
      for (let i = 0; i < WARN_THRESHOLD_PERM; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      const status = await db.getBanStatus(USER_ID, BROADCAST_ID);
      assertExists(status);
      assertEquals(status!.expiresAt, null);
    });
  });

  describe("liftBan", () => {
    it("returns false when no ban exists", async () => {
      assertEquals(await db.liftBan(USER_ID, BROADCAST_ID), false);
    });

    it("removes the ban and returns true", async () => {
      for (let i = 0; i < WARN_THRESHOLD_TEMP; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), true);

      const lifted = await db.liftBan(USER_ID, BROADCAST_ID);
      assertEquals(lifted, true);
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), false);
    });
  });

  describe("removeWarnings", () => {
    it("returns 0 when there are no warnings", async () => {
      const removed = await db.removeWarnings(USER_ID, BROADCAST_ID, 1);
      assertEquals(removed, 0);
    });

    it("removes 1 warning and returns 1", async () => {
      await db.issueWarning(USER_ID, BROADCAST_ID, null);
      await db.issueWarning(USER_ID, BROADCAST_ID, null);
      const removed = await db.removeWarnings(USER_ID, BROADCAST_ID, 1);
      assertEquals(removed, 1);
      assertEquals(await db.getUserWarningCount(USER_ID, BROADCAST_ID), 1);
    });

    it("removes all warnings when count is omitted", async () => {
      await db.issueWarning(USER_ID, BROADCAST_ID, null);
      await db.issueWarning(USER_ID, BROADCAST_ID, null);
      await db.issueWarning(USER_ID, BROADCAST_ID, null);
      const removed = await db.removeWarnings(USER_ID, BROADCAST_ID);
      assertEquals(removed, 3);
      assertEquals(await db.getUserWarningCount(USER_ID, BROADCAST_ID), 0);
    });

    it("removes the most recent warning", async () => {
      await db.issueWarning(USER_ID, BROADCAST_ID, null, "first");
      await db.issueWarning(USER_ID, BROADCAST_ID, null, "second");
      await db.removeWarnings(USER_ID, BROADCAST_ID, 1);
      const conn = await db.pool.connect();
      try {
        const { rows } = await conn.queryObject<{ reason: string | null }>({
          text: `SELECT reason FROM warnings WHERE user_id = $1 AND broadcast_id = $2`,
          args: [USER_ID, BROADCAST_ID],
        });
        assertEquals(rows.length, 1);
        assertEquals(rows[0].reason, "first");
      } finally {
        conn.release();
      }
    });
  });
});
