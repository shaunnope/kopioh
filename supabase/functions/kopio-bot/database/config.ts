import { logger } from "../logger.ts";
import { pool } from "./pool.ts";

export const ALL_CONTENT_TYPES = [
  "text", "photo", "video", "audio", "voice",
  "animation", "sticker", "poll", "document",
] as const;

/**Supported message types for reposting via bot */
export type ContentType = typeof ALL_CONTENT_TYPES[number];

export const LOG_EVENT_TYPES = [
  "submission.new", "submission.approved", "submission.edited",
  "submission.rejected", "submission.skipped", "submission.posted", "submission.auto_posted",
  "whisper.new",
  "queue.low",
  "role.added", "role.removed", "role.reset",
  "connection.created", "connection.deleted", "logs.set", "logs.cleared",
  "config.allowed_types", "config.whisper",
  "privacy.anonymized", "privacy.deleted",
] as const;

export type LogEventType = typeof LOG_EVENT_TYPES[number];

export type ConnectionConfig = {
  allowed_types: ContentType[];
  whisper_allowed_types: ContentType[];
  whisper_limit: number;
  whisper_period_minutes: number;
  warn_threshold_temp: number;
  warn_threshold_perm: number;
  temp_ban_days: number;
  log_excluded_events: LogEventType[];
};

export const DEFAULT_CONFIG: ConnectionConfig = {
  allowed_types: [...ALL_CONTENT_TYPES],
  whisper_allowed_types: ["text"],
  whisper_limit: 3,
  whisper_period_minutes: 60,
  warn_threshold_temp: 3,
  warn_threshold_perm: 5,
  temp_ban_days: 7,
  log_excluded_events: ["whisper.new"],
};

export async function getConnectionConfig(connectionId: string): Promise<ConnectionConfig> {
  const conn = await pool.connect();
  try {
    const { rows } = await conn.queryObject<{
      allowed_types: string[];
      whisper_allowed_types: string[];
      whisper_limit: number;
      whisper_period_minutes: number;
      warn_threshold_temp: number;
      warn_threshold_perm: number;
      temp_ban_days: number;
      log_excluded_events: string[];
    }>({
      text: `SELECT allowed_types, whisper_allowed_types, whisper_limit, whisper_period_minutes, warn_threshold_temp, warn_threshold_perm, temp_ban_days, log_excluded_events FROM connection_config WHERE connection_id = $1`,
      args: [connectionId],
    });
    if (!rows[0]) return { ...DEFAULT_CONFIG, allowed_types: [...DEFAULT_CONFIG.allowed_types], whisper_allowed_types: [...DEFAULT_CONFIG.whisper_allowed_types], log_excluded_events: [...DEFAULT_CONFIG.log_excluded_events] };
    return {
      allowed_types: rows[0].allowed_types as ContentType[],
      whisper_allowed_types: rows[0].whisper_allowed_types as ContentType[],
      whisper_limit: rows[0].whisper_limit,
      whisper_period_minutes: rows[0].whisper_period_minutes,
      warn_threshold_temp: rows[0].warn_threshold_temp,
      warn_threshold_perm: rows[0].warn_threshold_perm,
      temp_ban_days: rows[0].temp_ban_days,
      log_excluded_events: rows[0].log_excluded_events as LogEventType[],
    };
  } catch (error) {
    logger.error({ msg: "db.getConnectionConfig failed", connectionId, error });
    return { ...DEFAULT_CONFIG, allowed_types: [...DEFAULT_CONFIG.allowed_types], whisper_allowed_types: [...DEFAULT_CONFIG.whisper_allowed_types], log_excluded_events: [...DEFAULT_CONFIG.log_excluded_events] };
  } finally {
    conn.release();
  }
}

export async function setAllowedTypes(connectionId: string, types: ContentType[]): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO connection_config (connection_id, allowed_types)
        VALUES ($1, $2)
        ON CONFLICT (connection_id) DO UPDATE SET allowed_types = EXCLUDED.allowed_types, updated_at = NOW()
      `,
      args: [connectionId, types],
    });
    logger.trace({ msg: "db.setAllowedTypes", connectionId, types });
  } catch (error) {
    logger.error({ msg: "db.setAllowedTypes failed", connectionId, error });
  } finally {
    conn.release();
  }
}

export async function setWhisperAllowedTypes(connectionId: string, types: ContentType[]): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO connection_config (connection_id, whisper_allowed_types)
        VALUES ($1, $2)
        ON CONFLICT (connection_id) DO UPDATE SET whisper_allowed_types = EXCLUDED.whisper_allowed_types, updated_at = NOW()
      `,
      args: [connectionId, types],
    });
    logger.trace({ msg: "db.setWhisperAllowedTypes", connectionId, types });
  } catch (error) {
    logger.error({ msg: "db.setWhisperAllowedTypes failed", connectionId, error });
  } finally {
    conn.release();
  }
}

export async function setWhisperLimit(connectionId: string, limit: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO connection_config (connection_id, whisper_limit)
        VALUES ($1, $2)
        ON CONFLICT (connection_id) DO UPDATE SET whisper_limit = EXCLUDED.whisper_limit, updated_at = NOW()
      `,
      args: [connectionId, limit],
    });
    logger.trace({ msg: "db.setWhisperLimit", connectionId, limit });
  } catch (error) {
    logger.error({ msg: "db.setWhisperLimit failed", connectionId, error });
  } finally {
    conn.release();
  }
}

export async function setWhisperPeriodMinutes(connectionId: string, minutes: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO connection_config (connection_id, whisper_period_minutes)
        VALUES ($1, $2)
        ON CONFLICT (connection_id) DO UPDATE SET whisper_period_minutes = EXCLUDED.whisper_period_minutes, updated_at = NOW()
      `,
      args: [connectionId, minutes],
    });
    logger.trace({ msg: "db.setWhisperPeriodMinutes", connectionId, minutes });
  } catch (error) {
    logger.error({ msg: "db.setWhisperPeriodMinutes failed", connectionId, error });
  } finally {
    conn.release();
  }
}

export async function setWarnThresholdTemp(connectionId: string, threshold: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO connection_config (connection_id, warn_threshold_temp)
        VALUES ($1, $2)
        ON CONFLICT (connection_id) DO UPDATE SET warn_threshold_temp = EXCLUDED.warn_threshold_temp, updated_at = NOW()
      `,
      args: [connectionId, threshold],
    });
    logger.trace({ msg: "db.setWarnThresholdTemp", connectionId, threshold });
  } catch (error) {
    logger.error({ msg: "db.setWarnThresholdTemp failed", connectionId, error });
  } finally {
    conn.release();
  }
}

export async function setWarnThresholdPerm(connectionId: string, threshold: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO connection_config (connection_id, warn_threshold_perm)
        VALUES ($1, $2)
        ON CONFLICT (connection_id) DO UPDATE SET warn_threshold_perm = EXCLUDED.warn_threshold_perm, updated_at = NOW()
      `,
      args: [connectionId, threshold],
    });
    logger.trace({ msg: "db.setWarnThresholdPerm", connectionId, threshold });
  } catch (error) {
    logger.error({ msg: "db.setWarnThresholdPerm failed", connectionId, error });
  } finally {
    conn.release();
  }
}

export async function setTempBanDays(connectionId: string, days: number): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO connection_config (connection_id, temp_ban_days)
        VALUES ($1, $2)
        ON CONFLICT (connection_id) DO UPDATE SET temp_ban_days = EXCLUDED.temp_ban_days, updated_at = NOW()
      `,
      args: [connectionId, days],
    });
    logger.trace({ msg: "db.setTempBanDays", connectionId, days });
  } catch (error) {
    logger.error({ msg: "db.setTempBanDays failed", connectionId, error });
  } finally {
    conn.release();
  }
}

export async function setLogExcludedEvents(connectionId: string, excluded: LogEventType[]): Promise<void> {
  const conn = await pool.connect();
  try {
    await conn.queryObject({
      text: `
        INSERT INTO connection_config (connection_id, log_excluded_events)
        VALUES ($1, $2)
        ON CONFLICT (connection_id) DO UPDATE SET log_excluded_events = EXCLUDED.log_excluded_events, updated_at = NOW()
      `,
      args: [connectionId, excluded],
    });
    logger.trace({ msg: "db.setLogExcludedEvents", connectionId, excluded });
  } catch (error) {
    logger.error({ msg: "db.setLogExcludedEvents failed", connectionId, error });
  } finally {
    conn.release();
  }
}
