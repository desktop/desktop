import { join } from 'path'

/** The standalone runtime entry point within a copied Copilot SDK package. */
export function getCopilotRuntimePath(
  runtimeRoot: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  return join(
    runtimeRoot,
    'prebuilds',
    `${platform}-${arch}`,
    platform === 'win32' ? 'copilot-runtime.exe' : 'copilot-runtime'
  )
}
