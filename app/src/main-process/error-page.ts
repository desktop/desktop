/* tslint:disable:no-sync-functions */
import { app, BrowserWindow } from 'electron'

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
 * Display a static page embedded with the error information, so that a user
 * can provide details to our support channels.
 *
 * Note: because of the unknown application state, this method generates a
 * static file to the user's TEMP directory, with the existing styles file
 * alongside so that the error dialog looks consistent with the rest of the
 * application.
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
  const errorContent = error.stack || error.message
  const escapedErrorContent = htmlEscape(errorContent)

  const content = `
  <strong>Version:</strong> ${app.getVersion()}<br />
  <strong>Platform:</strong> ${process.platform}<br />
  <strong>Error:</strong> ${escapedErrorContent}`

  const formattedBody = source.replace('<!--{{content}}-->', content)

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

  // ensure we have focus
  window.show()
}
