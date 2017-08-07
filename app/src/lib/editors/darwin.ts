const appPath: (id: string) => Promise<string> = require('app-path')

import { FoundEditor } from './models'

export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  const results: Array<FoundEditor> = []

  const atomLabel = 'Atom'

  try {
    await appPath('com.github.atom')
    // TODO: check this shim exists
    const atom = { app: atomLabel, exists: true, path: '/usr/local/bin/atom' }
    results.push(atom)
  } catch (error) {
    log.debug(`Unable to locate ${atomLabel} installation`, error)
  }

  const codeLabel = 'Visual Studio Code'
  let code: FoundEditor | null = null
  try {
    await appPath('com.microsoft.VSCode')
    // TODO: check this shim exists
    code = { app: codeLabel, path: '/usr/local/bin/code' }
  } catch (error) {
    log.debug(`Unable to locate ${codeLabel} installation`, error)
  }

  const sublimeLabel = 'Sublime Text'
  try {
    const path = await appPath('com.sublimetext.3')
    // TODO: does a shim exist? what should I be invoking?
    const sublime = { app: sublimeLabel, path }
    results.push(sublime)
  } catch (error) {
    log.debug(`Unable to locate ${codeLabel} installation`, error)
  }

  return results
}
