/* tslint:disable:no-sync-functions */
import { app, BrowserWindow } from 'electron'

import * as Fs from 'fs'
import * as Path from 'path'

import { logError } from '../lib/logging/main'

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
  const errorTemplate = Path.join(__dirname, 'error.html')
  let data: Buffer | null = null
  try {
    data = Fs.readFileSync(errorTemplate)
  } catch (e) {
    logError(`Exiting, unable to read error template at '${errorTemplate}'`, e)
    return
  }

  const source = data.toString()
  const errorContent = error.stack || error.message

  const content = `<p class='stack'>
    <strong>Version:</strong> ${app.getVersion()}<br />
    <strong>Platform:</strong> ${process.platform}<br />
    <strong>Error:</strong> <span id='error-content'></span>
  </p>
  <script>
    var rawText = \`${errorContent}\`;
    var element = document.createElement('div');
    element.textContent = rawText;
    var sanitized = element.innerHTML;
    document.getElementById('error-content').innerHTML = sanitized;
  </script>`

  const formattedBody = source.replace('<!--{{content}}-->', content)

  const dataUriContents = new Buffer(formattedBody).toString('base64')

  const window = new BrowserWindow()
  window.loadURL(`data:text/html;base64,${dataUriContents}`)

  // ensure we have focus
  window.show()
}
