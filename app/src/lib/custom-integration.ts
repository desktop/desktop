import { parseCommandLineArgv } from 'windows-argv-parser'
import stringArgv from 'string-argv'
import { promisify } from 'util'
import { exec } from 'child_process'
import { access, stat } from 'fs/promises'
import * as fs from 'fs'

const execAsync = promisify(exec)

/** The string that will be replaced by the target path in the custom integration arguments */
export const TargetPathArgument = '%TARGET_PATH%'

/** The interface representing a custom integration (external editor or shell) */
export interface ICustomIntegration {
  /** The path to the custom integration */
  readonly path: string
  /** The arguments to pass to the custom integration */
  readonly arguments: ReadonlyArray<string>
  /** The bundle ID of the custom integration (macOS only) */
  readonly bundleID?: string
}

/**
 * Parse the arguments string of a custom integration into an array of strings.
 *
 * @param args The arguments string to parse
 */
export function parseCustomIntegrationArguments(
  args: string
): ReadonlyArray<string> {
  return __WIN32__ ? parseCommandLineArgv(args) : stringArgv(args)
}

// Function to retrieve, on macOS, the bundleId of an app given its path
async function getAppBundleID(path: string) {
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

/**
 * Replace the target path placeholder in the custom integration arguments with
 * the actual target path.
 *
 * @param args The custom integration arguments
 * @param repoPath The target path to replace the placeholder with
 */
export function expandTargetPathArgument(
  args: ReadonlyArray<string>,
  repoPath: string
): ReadonlyArray<string> {
  return args.map(arg => arg.replaceAll(TargetPathArgument, repoPath))
}

/**
 * Check if the custom integration arguments contain the target path placeholder.
 *
 * @param args The custom integration arguments
 */
export function checkTargetPathArgument(args: ReadonlyArray<string>): boolean {
  return args.some(arg => arg.includes(TargetPathArgument))
}

/**
 * Validate the path of a custom integration.
 *
 * @param path The path to the custom integration
 *
 * @returns An object with a boolean indicating if the path is valid and, if
 *          the path is a macOS app, the bundle ID of the app.
 */
export async function validateCustomIntegrationPath(
  path: string
): Promise<{ isValid: boolean; bundleID?: string }> {
  if (path.length === 0) {
    return { isValid: false }
  }

  let bundleID = undefined

  try {
    const pathStat = await stat(path)
    const canBeExecuted = await access(path, fs.constants.X_OK)
      .then(() => true)
      .catch(() => false)

    const isExecutableFile = pathStat.isFile() && canBeExecuted

    // On macOS, not only executable files are valid, but also apps (which are
    // directories with a `.app` extension and from which we can retrieve
    // the app bundle ID)
    if (__DARWIN__ && !isExecutableFile && pathStat.isDirectory()) {
      bundleID = await getAppBundleID(path)
    }

    return { isValid: isExecutableFile || !!bundleID, bundleID }
  } catch (e) {
    return { isValid: false }
  }
}

/**
 * Check if a custom integration is valid (meaning both the path and the
 * arguments are valid).
 *
 * @param customIntegration The custom integration to validate
 */
export async function isValidCustomIntegration(
  customIntegration: ICustomIntegration
): Promise<boolean> {
  const pathResult = await validateCustomIntegrationPath(customIntegration.path)
  const targetPathPresent = checkTargetPathArgument(customIntegration.arguments)
  return pathResult.isValid && targetPathPresent
}
