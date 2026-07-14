/** Returns '' if count === 1 or 's' otherwise */
export function plural(count: number): string {
  return count === 1 ? '' : 's'
}
