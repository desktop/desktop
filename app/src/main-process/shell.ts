import * as Url from 'url'
import { shell } from 'electron'

/**
 * Wraps the inbuilt shell.openItem path to address a focus issue that affects macOS.
 *
 * When opening a folder in Finder, the window will appear behind the application
 * window, which may confuse users. As a workaround, we will fallback to using
 * shell.openExternal for macOS until it can be fixed upstream.
 *
 * @param path directory to open
 */
export function openDirectorySafe(path: string) {
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
    shell.openItem(path)
  }
}
