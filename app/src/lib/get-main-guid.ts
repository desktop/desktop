import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { uuid } from './uuid'

let cachedGUID: string | null = null

/** Get the GUID for the Main process. */
export async function getMainGUID(): Promise<string> {
  if (!cachedGUID) {
    let guid = await readGUIDFile()

    if (guid === undefined) {
      guid = uuid()
      await saveGUIDFile(guid).catch(e => {
        log.error(e)
      })
    }

    cachedGUID = guid
  }

  return cachedGUID
}

/** Reads the persisted GUID from the .guid file or generates a new one */
async function readGUIDFile(): Promise<string | undefined> {
  let guid = undefined

  try {
    guid = (await readFile(getGUIDPath(), 'utf8')).trim()

    // Validate (at least) the GUID by its length
    if (guid.length !== 36) {
      guid = undefined
    }
  } catch (e) {}

  return guid
}

/** Saves the GUID to the .guid file */
export async function saveGUIDFile(guid: string) {
  // Cache the GUID even if it's not saved. This is handy for GUIDs that are
  // migrated from the renderer process, in case the persistence fails.
  // Otherwise, getMainGUID will cache the GUID anyway. This line can be removed
  // once we remove the migration code.
  cachedGUID = guid
  await writeFile(getGUIDPath(), guid, 'utf8')
}

const getGUIDPath = () => join(app.getPath('userData'), '.guid')
