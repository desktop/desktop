import { v4 as uuid } from 'uuid'

const activeIds = new Set<string>()
const poolPrefix = '__'

function sanitizeId(id: string): string {
  // We're following the old HTML4 rules for ids for know
  // and we're explicitly not testing for a valid first
  // character since we have the poolPrefix which will
  // guarantee that.
  // See http://stackoverflow.com/a/79022/2114
  return id.replace(/[^a-z0-9\-_:.]+/ig, '_')
}

export function createUniqueId(prefix: string): string {

  if (__DEV__) {
    if (activeIds.size > 50) {
      console.warn(`Id pool contains ${activeIds.size} entries, it's possible that id's aren't being released properly.`)
    }
  }

  const safePrefix = sanitizeId(`${poolPrefix}${prefix}`)

  for (let i = 0; i < 100; i++) {
    const id = i > 0
      ? `${safePrefix}_${i}`
      : safePrefix

    if (!activeIds.has(id)) {
      activeIds.add(id)
      return id
    }
  }

  // If we've failed to create an id 100 times it's likely
  // that we've either started using the id pool so widely
  // that 100 isn't enough at which point we should really
  // look into the root cause because that shouldn't be
  // necessary. In either case, let's just return a uuid
  // without storing it in the activeIds set because we
  // know it'll be unique.
  if (__DEV__) {
    console.warn(`Exhausted search for valid id for ${prefix}. Please investigate.`)
  }

  return uuid()
}

export function releaseUniqueId(id: string) {
  activeIds.delete(id)
}
