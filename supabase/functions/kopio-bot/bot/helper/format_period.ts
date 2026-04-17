/** Formats a duration in minutes into the most natural human-readable unit. */
export function formatPeriod(minutes: number): string {
  if (minutes % (60 * 24 * 7) === 0) return `${minutes / (60 * 24 * 7)}w`;
  if (minutes % (60 * 24) === 0) return `${minutes / (60 * 24)}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}min`;
}
