import { remote } from 'electron'
import * as Fs from 'fs'
import * as moment from 'moment'

export * from './ssh-environment'
export * from './verification'

export function saveLogFile(error: string) {
  const timestamp = moment().format('YYYYMMDD-HHmmss')
  const defaultPath = `ssh-output-${timestamp}.txt`

  // TODO: null should be a valid argument here
  const window: any = null
  remote.dialog.showSaveDialog(window, { defaultPath }, filename => {
    if (filename == null) {
      log.warn('filename returned null, this needs to be in the signature')
      return
    }
    Fs.writeFileSync(filename, error)
  })
}
