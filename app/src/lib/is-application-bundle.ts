import getFileMetadata from 'file-metadata'

/**
 * Attempts to determine if the provided path is an application bundle or not.
 *
 * macOS differs from the other platforms we support in that a directory can
 * also be an application and therefore executable making it unsafe to open
 * directories on macOS as we could conceivably end up launching an application.
 *
 * This application uses file metadata (the `mdls` tool to be exact) to
 * determine whether a path is actually an application bundle or otherwise
 * executable.
 *
 * NOTE: This method will always return false when not running on macOS.
 */
export async function isApplicationBundle(path: string): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false
  }

  const metadata = await getFileMetadata(path)

  if (metadata['contentType'] === 'com.apple.application-bundle') {
    return true
  }

  const contentTypeTree = metadata['contentTypeTree']

  if (Array.isArray(contentTypeTree)) {
    for (const contentType of contentTypeTree) {
      switch (contentType) {
        case 'com.apple.application-bundle':
        case 'com.apple.application':
        case 'public.executable':
          return true
      }
    }
  }

  return false
}
