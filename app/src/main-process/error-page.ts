/* tslint:disable:no-sync-functions */
import { BrowserWindow } from 'electron'

import * as Fs from 'fs'
import * as Path from 'path'
import * as Os from 'os'
import * as url from 'url'

import { getLogger } from '../lib/logging/main'

function htmlEscape(input: string): string {
    input = input.replace(/&/g, '&amp;')
    input = input.replace(/</g, '&lt;')
    input = input.replace(/>/g, '&gt;')
    return input
}

/**
 * Display a static page embedded with the error information, so that
 * a user can provide details to our support channels.
 *
 * Note: because of the dynamic error, we dump a generated file to the
 * TEMP directory, and drop the existing styles file alongside so that
 * the error dialog looks somewhat familiar.
 *
 * @param error The error to display on the page
 */
export function showFallbackPage(error: Error) {
  const logger = getLogger()
  const tmpdir = Os.tmpdir()

  const stylesInput = Path.join(__dirname, 'styles.css')
  const stylesOutput = Path.join(tmpdir, 'styles.css')
  try {
    const stylesheet = Fs.readFileSync(stylesInput, 'utf-8')
    Fs.writeFileSync(stylesOutput, stylesheet)
  } catch (e) {
    // in dev mode we don't have access to these styles, so there's no need
    // to try and apply these here - just show _something_ in the dialog
  }

  const errorTemplate = Path.join(__dirname, 'error.html')
  let data: Buffer | null = null
  try {
    data = Fs.readFileSync(errorTemplate)
  } catch (e) {
    logger.error(`Exiting, unable to read error template at '${errorTemplate}'`, e)
    return
  }

  const source = data.toString()
  const content = error.stack || error.message
  const escapedContent = htmlEscape(content)

  const formattedBody = source.replace('<!--{{content}}-->', escapedContent)

  const outputFile = Path.join(tmpdir, 'desktop-error-page.html')
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
