/**
 * Serialize a value to a JSON string safe for storage in Postgres JSONB columns.
 * BigInt values are coerced to Number to avoid serialization errors.
 */
export function toJsonb(value: unknown): string {
  return JSON.stringify(value, (_, v) => typeof v === "bigint" ? Number(v) : v);
}
