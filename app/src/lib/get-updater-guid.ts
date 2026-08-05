import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

let cachedGUID: string | undefined = undefined

const getUpdateGUIDPath = () => join(app.getPath('userData'), '.update-id')
const writeUpdateGUID = (id = crypto.randomUUID()) =>
  writeFile(getUpdateGUIDPath(), id).then(() => id)

export const getUpdaterGUID = async () => {
  return (
    cachedGUID ??
    readFile(getUpdateGUIDPath(), 'utf8')
      .then(id => id.trim())
      .then(id => (id.length === 36 ? id : writeUpdateGUID()))
      .catch(() => writeUpdateGUID())
      .catch(e => {
        log.error(`Could not read update id`, e)
        return undefined
      })
      .then(id => (cachedGUID = id))
  )
}
