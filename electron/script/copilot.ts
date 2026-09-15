/* eslint-disable no-sync */
import { cpSync, rmSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { getCopilotRuntimePath } from '../app/src/lib/copilot-runtime'

/** Copy the SDK's target-specific runtime and its companion assets. */
export function copyCopilotDependency(
  nodeModulesRoot: string,
  destination: string,
  platform: NodeJS.Platform,
  arch: string
): void {
  const source = join(
    nodeModulesRoot,
    '@github',
    `copilot-sdk-${platform}-${arch}`
  )
  const runtimePath = getCopilotRuntimePath(source, platform, arch)

  // Both files are required by the standalone runtime. Fail the build rather
  // than shipping a client that cannot start when optional packages are missing.
  for (const file of [
    runtimePath,
    join(dirname(runtimePath), 'runtime.node'),
  ]) {
    const info = statSync(file)
    if (!info.isFile() || info.size === 0) {
      throw new Error(`Missing or empty Copilot runtime file: ${file}`)
    }
  }

  // SDK platform packages already exclude other platforms and CLI-only assets.
  // Preserve their layout: the wrapper loads runtime.node and adjacent assets.
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, { recursive: true, verbatimSymlinks: true })
}
