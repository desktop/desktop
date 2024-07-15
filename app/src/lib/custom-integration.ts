import { parseCommandLineArgv } from 'windows-argv-parser'
import parseArgvString from 'string-to-argv'
import { promisify } from 'util'
import { exec } from 'child_process'
import { access, stat } from 'fs/promises'
import * as fs from 'fs'

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

export function expandTargetPathArgument(
  args: ReadonlyArray<string>,
  repoPath: string
): ReadonlyArray<string> {
  return args.map(arg => arg.replaceAll(TargetPathArgument, repoPath))
}

export function checkTargetPathArgument(args: ReadonlyArray<string>): boolean {
  return args.some(arg => arg.includes(TargetPathArgument))
}

export async function isValidPath(
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

export async function isValidCustomIntegration(
  customIntegration: ICustomIntegration
): Promise<boolean> {
  const pathResult = await isValidPath(customIntegration.path)
  const targetPathPresent = checkTargetPathArgument(customIntegration.arguments)
  return pathResult.isValid && targetPathPresent
}
