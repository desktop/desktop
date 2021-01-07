type HashableType = number | string | boolean | undefined | null

export function createHash(items: HashableType[]) {
  return items.join('+')
}
