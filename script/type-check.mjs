import { execFile, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { delimiter, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
export const projectRoot = resolve(import.meta.dirname, '..')
const compiler = resolve(
  dirname(require.resolve('@typescript/native/package.json')),
  'bin/tsc'
)
const execFileAsync = promisify(execFile)

export const projects = {
  app: 'tsconfig.json',
  scripts: 'script/tsconfig.json',
  bootstrap: 'script/tsconfig.bootstrap.json',
  highlighter: 'app/src/highlighter/tsconfig.json',
  eslint: 'eslint-rules/tsconfig.json',
  trampoline: 'vendor/desktop-trampoline/tsconfig.json',
  'trampoline-tests': 'vendor/desktop-trampoline/tsconfig.test.json',
  notifications: 'vendor/desktop-notifications/tsconfig.json',
  argv: 'vendor/windows-argv-parser/tsconfig.json',
}

/**
 * Run a subprocess without losing spawn errors or signal failures.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<void>}
 */
export function runNode(args, cwd = projectRoot) {
  return new Promise((resolve, reject) => {
    const pathKey =
      Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        [pathKey]:
          `${projectRoot}/node_modules/.bin${delimiter}` +
          (process.env[pathKey] ?? ''),
      },
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(
            `${args.join(' ')} failed (${signal ?? `exit code ${code}`})`
          )
        )
      }
    })
  })
}

/**
 * Check a complete project with the native compiler before any transpilation.
 *
 * @param {string} config
 * @returns {Promise<void>}
 */
export function checkProject(config) {
  return runNode([compiler, '--project', config, '--noEmit', '--pretty', 'false'])
}

/**
 * Include unbundled source and declaration files in webpack's watch graph.
 *
 * @param {string} config
 * @returns {Promise<string[]>}
 */
export async function listProjectFiles(config) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [compiler, '--project', config, '--listFilesOnly', '--pretty', 'false'],
    { cwd: projectRoot, maxBuffer: 8 * 1024 * 1024 }
  )
  return stdout.split(/\r?\n/).filter(file => file.length > 0)
}

/**
 * @param {string} scope
 * @returns {Promise<void>}
 */
export async function checkScope(scope) {
  if (scope === 'all') {
    for (const config of Object.values(projects)) {
      await checkProject(config)
    }
    return
  }

  const entry = Object.entries(projects).find(([name]) => name === scope)
  if (entry === undefined) {
    throw new Error(`Unknown type-check scope: ${scope}`)
  }
  await checkProject(entry[1])
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await checkScope(process.argv[2] ?? 'all')
}
