import * as Url from 'url'
import { shell } from 'electron'

/**
 * Wraps the inbuilt shell.openItem path to address a focus issue that affects macOS.
 *
 * When opening a folder in Finder, the window will appear behind the application
 * window, which may confuse users. As a workaround, we will fallback to using
 * shell.openExternal for macOS until it can be fixed upstream.
 *
 * CAUTION: This method should never be used to open user-provided or derived
 * paths. It's sole use is to open _directories_ that we know to be safe, no
 * verification is performed to ensure that the provided path isn't actually
 * an executable.
 *
 * @param path directory to open
 */
export function UNSAFE_openDirectory(path: string) {
  if (__DARWIN__) {
    const directoryURL = Url.format({
      pathname: path,
      protocol: 'file:',
      slashes: true,
    })

    shell
      .openExternal(directoryURL)
      .catch(err => log.error(`Failed to open directory (${path})`, err))
  } else {
    shell.openPath(path).then(err => {
      if (err !== '') {
        log.error(`Failed to open directory (${path}): ${err}`)
      }
    })
  }
}
