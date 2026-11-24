import { getDistArchitecture } from './dist-info'

/**
 * Invoke the current npm CLI through Node, avoiding Windows .cmd launchers.
 */
export function getNpmCommand(
  args: ReadonlyArray<string>,
  npmCliPath: string | undefined = process.env.npm_execpath
) {
  if (npmCliPath === undefined || npmCliPath.length === 0) {
    throw new Error('Cannot find the npm CLI. Run this command through npm.')
  }

  return { executable: process.execPath, args: [npmCliPath, ...args] }
}

/** Preserve frozen installs and rebuild local packages for the target CPU. */
export function getAppInstallCommands(
  npmCommand: string | undefined = process.env.npm_command,
  arch: string = getDistArchitecture()
): ReadonlyArray<ReadonlyArray<string>> {
  const args = ['--prefix', 'app', '--cpu', arch, '--foreground-scripts']

  // Sync changed manifests without running scripts, then replace cached local
  // packages so source changes rebuild even when their versions haven't changed.
  return npmCommand === 'ci'
    ? [['ci', ...args]]
    : [
        ['install', ...args, '--package-lock-only', '--ignore-scripts'],
        ['ci', ...args],
      ]
}
