import { uuid } from '../uuid'

/** The localStorage key for the stats GUID. */
const StatsGUIDKey = 'stats-guid'

let cachedGUID: string | null = null

/** Get the stats GUID. */
export function getGUID(): string {
  if (!cachedGUID) {
    let guid = localStorage.getItem(StatsGUIDKey)
    if (!guid) {
      guid = uuid()
      localStorage.setItem(StatsGUIDKey, guid)
    }

    cachedGUID = guid
  }

  return cachedGUID
}
