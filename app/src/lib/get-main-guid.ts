import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { uuid } from './uuid'

let cachedGUID: string | null = null

/** Get the GUID for the Main process. */
export async function getMainGUID(): Promise<string> {
  if (!cachedGUID) {
    cachedGUID = await readGUIDFile()
  }

  return cachedGUID
}

/** Reads the persisted GUID from the .guid file or generates a new one */
export async function readGUIDFile(): Promise<string> {
  let guid = undefined

  try {
    guid = await readFile(getGUIDPath(), 'utf8')

    // Validate (at least) the GUID by its length
    if (guid.length !== 36) {
      guid = undefined
    }
  } catch (e) {}

  if (guid === undefined) {
    guid = uuid()
    await saveGUIDFile(guid)
  }

  return guid
}

/** Saves the GUID to the .guid file */
export async function saveGUIDFile(guid: string) {
  await writeFile(getGUIDPath(), guid, 'utf8').catch(e => {
    log.error(e)
  })
}

const getGUIDPath = () => join(app.getPath('userData'), '.guid')
