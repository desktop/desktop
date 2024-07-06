import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { uuid } from './uuid'

let cachedGUID: string | undefined = undefined

const getUpdateGUIDPath = () => join(app.getPath('userData'), '.update-id')
const writeUpdateGUID = (id: string) =>
  writeFile(getUpdateGUIDPath(), id).then(() => id)

export const getUpdaterGUID = async () => {
  return (
    cachedGUID ??
    readFile(getUpdateGUIDPath(), 'utf8')
      .then(id => id.trim())
      .then(id => (id.length === 36 ? id : writeUpdateGUID(uuid())))
      .catch(() => writeUpdateGUID(uuid()))
      .catch(e => {
        log.error(`Could not read update id`, e)
        return undefined
      })
      .then(id => (cachedGUID = id))
  )
}
