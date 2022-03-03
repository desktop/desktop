import { execFile } from './exec-file'

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

  // Expected output for an application bundle:
  // $ mdls -name kMDItemContentType -name kMDItemContentTypeTree /Applications/GitHub\ Desktop.app
  // kMDItemContentType     = "com.apple.application-bundle"
  // kMDItemContentTypeTree = (
  //     "com.apple.application-bundle",
  //     "com.apple.application",
  //     "public.executable",
  //     "com.apple.localizable-name-bundle",
  //     "com.apple.bundle",
  //     "public.directory",
  //     "public.item",
  //     "com.apple.package"
  // )
  const { stdout } = await execFile('mdls', [
    ...['-name', 'kMDItemContentType'],
    ...['-name', 'kMDItemContentTypeTree'],
    path,
  ])

  const probableBundleIdentifiers = [
    'com.apple.application-bundle',
    'com.apple.application',
    'public.executable',
  ]

  return probableBundleIdentifiers.some(id => stdout.includes(`"${id}"`))
}
