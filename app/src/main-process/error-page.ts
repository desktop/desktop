import { BrowserWindow } from 'electron'

import * as Fs from 'fs'
import * as Path from 'path'
import * as Os from 'os'
import * as url from 'url'

import { getLogger } from '../lib/logging/main'

export function showFallbackPage(error: Error) {
  const source = Path.join(__dirname, 'error.html')
  let data: Buffer | null = null

  const logger = getLogger()

  try {
    data = Fs.readFileSync(source)
  } catch (e) {
    logger.error(`Unable to read file at path '${source}'`, e)
    return
  }

  const text = data.toString()
  const formattedBody = text.replace('<!--{{content}}-->', error.stack || error.message)

  const outputFile = Path.join(Os.tmpdir(), 'desktop-error-page.html')
  try {
    Fs.writeFileSync(outputFile, formattedBody)
  } catch (e) {
    logger.error(`Unable to write file at path '${outputFile}'`, e)
    return
  }

  const window = new BrowserWindow()
  window.loadURL(url.format({
    pathname: outputFile,
    protocol: 'file:',
    slashes: true,
  }))
}
