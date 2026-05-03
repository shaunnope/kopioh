import { describe, it, beforeEach, afterEach, afterAll } from "@std/testing/bdd";
import { assertEquals, assertExists, assertNotEquals } from "@std/assert";
import db from "../../database/index.ts";
import { WARN_THRESHOLD_TEMP, TEMP_BAN_DAYS } from "../../database/warning.ts";

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

    it("returns false and clears warnings when an expired temporary ban is found", async () => {
      for (let i = 0; i < WARN_THRESHOLD_TEMP; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      const conn = await db.pool.connect();
      try {
        await conn.queryObject({
          text: `UPDATE bans SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1 AND broadcast_id = $2`,
          args: [USER_ID, BROADCAST_ID],
        });
      } finally {
        conn.release();
      }
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), false);
      assertEquals(await db.getUserWarningCount(USER_ID, BROADCAST_ID), 0);
    });
  });

  describe("issueWarning", () => {
    it("returns a warningId, incremented count, and no ban below threshold", async () => {
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null);
      assertEquals(result.count, 1);
      assertEquals(result.banned, false);
      assertEquals(result.permanent, false);
      assertNotEquals(result.warningId, "");
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

    it("keeps all warnings on temp ban", async () => {
      for (let i = 0; i < WARN_THRESHOLD_TEMP - 1; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null, "trigger");
      assertEquals(result.banned, true);

      const remaining = await db.getUserWarningCount(USER_ID, BROADCAST_ID);
      assertEquals(remaining, WARN_THRESHOLD_TEMP);
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
      const thresholds = { warnThresholdTemp: 2, tempBanDays: 3 };
      await db.issueWarning(USER_ID, BROADCAST_ID, null, null, thresholds);
      const result = await db.issueWarning(USER_ID, BROADCAST_ID, null, null, thresholds);
      assertEquals(result.count, 2);
      assertEquals(result.banned, true);
      assertEquals(result.permanent, false);
      assertExists(result.expiresAt);
      const daysUntilExpiry = (result.expiresAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      assertEquals(daysUntilExpiry > 2, true);
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
  });

  describe("liftBan", () => {
    it("returns false when no ban exists", async () => {
      assertEquals(await db.liftBan(USER_ID, BROADCAST_ID), false);
    });

    it("removes the ban, clears warnings, and returns true", async () => {
      for (let i = 0; i < WARN_THRESHOLD_TEMP; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), true);

      const lifted = await db.liftBan(USER_ID, BROADCAST_ID);
      assertEquals(lifted, true);
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), false);
      assertEquals(await db.getUserWarningCount(USER_ID, BROADCAST_ID), 0);
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
      const removed = await db.removeWarnings(USER_ID, BROADCAST_ID);
      assertEquals(removed, 2);
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

  describe("appeals", () => {
    async function issueOneWarning(reason?: string) {
      return db.issueWarning(USER_ID, BROADCAST_ID, null, reason ?? null);
    }

    it("createAppeal returns the warningId for a valid warning belonging to the user", async () => {
      const { warningId } = await issueOneWarning("bad post");
      const appealId = await db.createAppeal(warningId, USER_ID, "it wasn't me");
      assertEquals(appealId, warningId);
    });

    it("createAppeal returns null for a warning that doesn't belong to the user", async () => {
      const { warningId } = await issueOneWarning();
      const appealId = await db.createAppeal(warningId, USER_ID + 1, "fraud");
      assertEquals(appealId, null);
    });

    it("createAppeal returns null for a duplicate appeal on the same warning", async () => {
      const { warningId } = await issueOneWarning();
      await db.createAppeal(warningId, USER_ID, "first appeal");
      const duplicate = await db.createAppeal(warningId, USER_ID, "second attempt");
      assertEquals(duplicate, null);
    });

    it("getAppeal returns the stored appeal with warning reason", async () => {
      const { warningId } = await issueOneWarning("inappropriate");
      await db.createAppeal(warningId, USER_ID, "not guilty");

      const appeal = await db.getAppeal(warningId);
      assertExists(appeal);
      assertEquals(appeal!.userId, USER_ID);
      assertEquals(appeal!.broadcastId, BROADCAST_ID);
      assertEquals(appeal!.reason, "not guilty");
      assertEquals(appeal!.warningReason, "inappropriate");
      assertEquals(appeal!.status, "pending");
      assertEquals(appeal!.rejectionReason, null);
    });

    it("getAppeal returns null for an unknown id", async () => {
      const appeal = await db.getAppeal("00000000-0000-0000-0000-000000000000");
      assertEquals(appeal, null);
    });

    it("liftAppeal removes all warnings, lifts the ban, and returns user info", async () => {
      for (let i = 0; i < WARN_THRESHOLD_TEMP - 1; i++) {
        await db.issueWarning(USER_ID, BROADCAST_ID, null);
      }
      const { warningId } = await issueOneWarning("final");
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), true);

      await db.createAppeal(warningId, USER_ID, "unfair");

      const result = await db.liftAppeal(warningId);
      assertExists(result);
      assertEquals(result!.userId, USER_ID);

      assertEquals(await db.getUserWarningCount(USER_ID, BROADCAST_ID), 0);
      assertEquals(await db.isUserBanned(USER_ID, BROADCAST_ID), false);
      assertEquals(await db.getAppeal(warningId), null);
    });

    it("liftAppeal returns null for a non-pending appeal", async () => {
      const { warningId } = await issueOneWarning();
      await db.createAppeal(warningId, USER_ID, "reason");
      await db.liftAppeal(warningId);
      assertEquals(await db.liftAppeal(warningId), null);
    });

    it("rejectAppeal updates status and stores rejection reason", async () => {
      const { warningId } = await issueOneWarning();
      await db.createAppeal(warningId, USER_ID, "my reason");

      const result = await db.rejectAppeal(warningId, "policy violation");
      assertExists(result);
      assertEquals(result!.userId, USER_ID);

      const appeal = await db.getAppeal(warningId);
      assertExists(appeal);
      assertEquals(appeal!.status, "rejected");
      assertEquals(appeal!.rejectionReason, "policy violation");

      assertEquals(await db.getUserWarningCount(USER_ID, BROADCAST_ID), 1);
    });

    it("rejectAppeal returns null for a non-pending appeal", async () => {
      const { warningId } = await issueOneWarning();
      await db.createAppeal(warningId, USER_ID, "reason");
      await db.rejectAppeal(warningId, "no");
      assertEquals(await db.rejectAppeal(warningId, "again"), null);
    });
  });
});
