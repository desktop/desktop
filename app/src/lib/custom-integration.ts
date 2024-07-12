import { parseCommandLineArgv } from 'windows-argv-parser'
import parseArgvString from 'string-to-argv'
import { promisify } from 'util'
import { exec } from 'child_process'

const execAsync = promisify(exec)

export const TargetPathArgument = '%TARGET_PATH%'

export interface ICustomIntegration {
  readonly path: string
  readonly arguments: ReadonlyArray<string>
  readonly bundleID?: string
}

export function parseCustomIntegrationArguments(
  args: string
): ReadonlyArray<string> {
  return __WIN32__ ? parseCommandLineArgv(args) : parseArgvString(args)
}

// Function to retrieve, on macOS, the bundleId of an app given its path
export async function getBundleID(path: string) {
  try {
    // Ensure the path ends with `.app` for applications
    if (!path.endsWith('.app')) {
      throw new Error(
        'The provided path does not point to a macOS application.'
      )
    }

    // Use mdls to query the kMDItemCFBundleIdentifier attribute
    const { stdout } = await execAsync(
      `mdls -name kMDItemCFBundleIdentifier -raw "${path}"`
    )
    const bundleId = stdout.trim()

    // Check for valid output
    if (!bundleId || bundleId === '(null)') {
      return undefined
    }

    return bundleId
  } catch (error) {
    console.error('Failed to retrieve bundle ID:', error)
    return undefined
  }
}

export function expandRepoPathArgument(
  args: ReadonlyArray<string>,
  repoPath: string
): ReadonlyArray<string> {
  return args.map(arg => (arg === TargetPathArgument ? repoPath : arg))
}
