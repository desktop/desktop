import { v4 as uuid } from 'uuid'

const activeIds = new Set<string>()
const poolPrefix = '__'

export function createUniqueId(prefix: string): string {

  if (__DEV__) {
    if (activeIds.size > 50) {
      console.warn(`Id pool contains ${activeIds.size} entries, it's possible that id's aren't being released properly.`)
    }
  }

  for (let i = 0; i < 100; i++) {
    const suffix = i > 0 ? i.toString() : ''
    const id = `${poolPrefix}${prefix}${suffix}`

    if (!activeIds.has(id)) {
      activeIds.add(id)
      return id
    }
  }

  if (__DEV__) {
    console.warn(`Exhausted search for valid id for ${prefix}. Please investigate.`)
  }

  return uuid()
}

export function releaseUniqueId(id: string) {
  activeIds.delete(id)
}
