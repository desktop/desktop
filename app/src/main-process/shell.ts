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
  // Add a trailing slash to the directory path.
  //
  // On Windows, if there's a file and a directory with the
  // same name (e.g `C:\MyFolder\foo` and `C:\MyFolder\foo.exe`),
  // when executing shell.openItem(`C:\MyFolder\foo`) then the EXE file
  // will get opened.
  // We can avoid this by adding a final backslash at the end of the path.
  const pathname = __WIN32__ && !path.endsWith('\\') ? `${path}\\` : path

  shell.openPath(pathname).then(err => {
    if (err !== '') {
      log.error(`Failed to open directory (${path}): ${err}`)
    }
  })
}
