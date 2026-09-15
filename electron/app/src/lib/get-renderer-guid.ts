import { getGUID, saveGUID } from '../ui/main-process-proxy'

/** The localStorage key for the stats GUID. */
const StatsGUIDKey = 'stats-guid'

let cachedGUID: string | null = null

/**
 * Get the GUID for the Renderer process.
 */
export async function getRendererGUID(): Promise<string> {
  cachedGUID = cachedGUID ?? (await getGUID())
  return cachedGUID
}

/**
 * Grabs the existing GUID from the LocalStorage (if any), caches it, and sends
 * it to the main process to be persisted.
 */
export async function migrateRendererGUID(): Promise<void> {
  const guid = localStorage.getItem(StatsGUIDKey)

  if (guid === null) {
    return
  }

  try {
    await saveGUID(guid)
    localStorage.removeItem(StatsGUIDKey)
  } catch (e) {
    log.error('Error migrating existing GUID', e)
  }

  cachedGUID = guid
}
