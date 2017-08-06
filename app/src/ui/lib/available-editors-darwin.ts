const appPath: (id: string) => Promise<string> = require('app-path')

export function findApp(
  bundleId: string,
  name: string
): Promise<{
  app: string
  path: string
}> {
  return appPath(bundleId)
    .catch(error => {
      log.debug(`Unable to locate ${name} installation`, error)
      return ''
    })
    .then(path => {
      return { app: name, path }
    })
}
