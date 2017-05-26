/**
 * Get the time from some arbitrary fixed starting point. The time will not be
 * based on clock time.
 */
export function now(): number {
  const time = process.hrtime()
  return time[0] * 1000 + time[1] / 1000000
}
