import { remote } from 'electron'
import { writeFile } from 'fs'
import * as moment from 'moment'

import { Repository } from '../../models/repository'

export function generateSSHTroubleshootingLog(
  repository: Repository
): Promise<string> {
  // TODO: - check if ssh-agent is running
  //       - if not found, Git is not likely to work

  // TODO: - get current environment variables
  //       - if not found, Git is not likely to work

  return Promise.resolve('oops')
}

export function saveLogFile(contents: string) {
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
        writeFile(filename, contents, err => {
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
