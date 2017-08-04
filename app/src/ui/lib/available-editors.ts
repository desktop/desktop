export type EditorLookup = {
  app: string,
  path?: string
}

async function getAvailableEditorsDarwin(): Promise<ReadonlyArray<EditorLookup>> {
  const appPath: (id: string) => Promise<string> = require('app-path')

  const atom = await appPath('com.github.atom')
    .catch(error => {
      log.debug('Unable to locate Atom installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Atom', path }
    })

  const code = await appPath('com.microsoft.VSCode')
    .catch(error => {
      log.debug('Unable to locate VSCode installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Visual Studio Code', path }
    })

  // TODO: what about Sublime Text 2?
  const sublime = await appPath('com.sublimetext.3')
    .catch(error => {
      log.debug('Unable to locate Sublime Text installation', error)
      return ''
    })
    .then(path => {
      return { app: 'Sublime Text', path }
    })

  const results = [atom, code, sublime]
  return results.filter(result => result.path !== '')
}

function getAvailableEditorsWindows(): Promise<ReadonlyArray<EditorLookup>> {
  // TODO: list entries that exist on the user's machine
  // TODO: include the name and the executable path to use
  // TODO: use platform-specific lookups here to make this more maintainable
  return Promise.resolve([
    { app: 'Atom', path: '' }, { app: 'Visual Studio Code', path: '' }, { app: 'Sublime Text', path: '' }])
}

export function getAvailableEditors(): Promise<ReadonlyArray<EditorLookup>> {
  if (__DARWIN__) {
    return getAvailableEditorsDarwin()
  }

  if (__WIN32__) {
    return getAvailableEditorsWindows()
  }

  console.warn(`Platform not currently supported for resolving editors: ${process.platform}`)
  return Promise.resolve([])
}
