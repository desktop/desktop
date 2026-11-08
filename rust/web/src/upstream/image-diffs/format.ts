const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
/** Format image sizes with IEC units, including empty images and negative deltas. */
export function formatBytes(bytes: number, decimals = 0): string {
  if (!Number.isFinite(bytes)) return 'Unknown'
  const unit =
    bytes === 0
      ? 0
      : Math.min(
          units.length - 1,
          Math.max(0, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)))
        )
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: decimals,
  }).format(bytes / 1024 ** unit)} ${units[unit]}`
}
/** Describe the size change without dividing by zero for an empty old version. */
export function sizeDifference(previous: number, current: number): string {
  if (previous === 0) return current === 0 ? '0%' : 'new size'
  return `${Math.round(Math.abs((current - previous) / previous) * 100)}%`
}
