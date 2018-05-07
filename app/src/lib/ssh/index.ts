import { remote } from 'electron'
import * as Fs from 'fs'
import * as moment from 'moment'

export * from './ssh-environment'
export * from './verification'

export function saveLogFile(stderr: string) {
  const timestamp = moment().format('YYYYMMDD-HHmmss')
  const defaultPath = `ssh-output-${timestamp}.txt`

  return new Promise<void>((resolve, reject) => {
    // TODO: null should be a valid argument here
    const window: any = null
    remote.dialog.showSaveDialog(window, { defaultPath }, filename => {
      if (filename == null) {
        log.warn(
          'TODO: filename returned null, this needs to be in the signature'
        )
        resolve()
      } else {
        Fs.writeFile(filename, stderr, err => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      }
    })
  })
}
