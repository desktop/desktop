import { lstat, open, realpath, rename, stat } from 'fs/promises'
import { homedir } from 'os'
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'fs'
import { GitError as DugiteError } from 'dugite'
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  parse,
  sep,
} from 'path'
import { Repository } from '../../models/repository'
import { IRemote } from '../../models/remote'
import { IAssistedCommitHead } from '../../models/assisted-commit'
import { AssistedCommitError, readAssistedCommitHead } from './assisted-commit'
import { quoteConfig } from './assisted-commit/git'
import { git, isGitError } from './core'
import { isErrnoException } from '../errno-exception'
import { getRemotes } from './remote'
import {
  AssistedCommitPushURLSource,
  getAssistedCommitPushConfigParameters,
} from './push'
import { findDefaultRemote } from '../stores/helpers/find-default-remote'
import {
  AssistedCommitFileVersionMismatchError,
  captureFileVersionFence,
  captureMutableFileRoutingFence,
  captureMutableTreeRoutingFence,
  captureObjectDirectoryRoutingFence,
  isAssistedCommitPathLayoutError,
} from './file-version-fence'
import {
  assertAssistedCommitGitResourceAdmission,
  getAssistedCommitProtectedResources,
} from './repository-operation'
import {
  acquireOwnedFileLock,
  IOwnedFileLease,
  releaseOwnedFileLock,
} from './owned-file-lock'

/** In-memory ownership for publication metadata cleanup, never history recovery. */
export interface IAssistedCommitPublicationResources {
  readonly locks: IOwnedFileLease[]
}

/** Finish retained publication-only cleanup before releasing repository protection. */
export async function cleanupAssistedCommitPublication(
  resources: IAssistedCommitPublicationResources
): Promise<void> {
  const errors: unknown[] = []
  for (const lock of resources.locks) {
    if (!lock.closed || !lock.consumed) {
      try {
        await releaseOwnedFileLock(lock)
      } catch (error) {
        errors.push(error)
      }
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      'Publication metadata cleanup needs attention'
    )
  }
}

/** Frozen, non-secret-serialized destination intent. No executable state is persisted. */
export type AssistedCommitPushDestination =
  | { readonly kind: 'unavailable'; readonly error: Error }
  | {
      readonly kind: 'configured'
      readonly repositoryId: number
      readonly path: string
      readonly resources: ReadonlyArray<string>
      readonly routingPaths: ReadonlyArray<string>
      readonly admissionPaths: ReadonlyArray<string>
      readonly resourceIdentity: string
      readonly branchRef: string
      readonly remoteRef: string
      readonly remote: IRemote
      readonly pushURL: string
      readonly rawPushURL: string
      readonly pushURLSource: AssistedCommitPushURLSource
      readonly gitDirectory: string
      readonly configurationFile: string
      readonly configurationPath: string
      readonly configurationAlias: string
      readonly branchPath: string
      readonly packedRefsPath: string
      readonly publishBranch: boolean
      readonly configuration: string
    }

const originalOwnerProofs = new WeakMap<
  AssistedCommitPushDestination,
  {
    readonly verify: () => void
    readonly acceptConfiguration: (bytes: Buffer) => void
  }
>()
const nativeConfigurationEnvironment = { GIT_CONFIG: undefined }

/** A changed destination is a local push refusal, never permission to choose another remote. */
export class AssistedCommitPushError extends Error {
  /** An acknowledged push's obsolete metadata obligation must not lock history. */
  public readonly publicationStale: boolean

  public constructor(
    message: string,
    options?: ErrorOptions & { readonly publicationStale?: boolean }
  ) {
    super(message, options)
    this.name = 'AssistedCommitPushError'
    this.publicationStale = options?.publicationStale === true
  }
}

async function capturePublicationFileVersionFence(
  paths: ReadonlyArray<string>
): Promise<() => void> {
  try {
    return await captureFileVersionFence(paths)
  } catch (error) {
    if (!(error instanceof AssistedCommitFileVersionMismatchError)) {
      throw error
    }
    throw new AssistedCommitPushError(
      'Commits were pushed, but original configuration or metadata became unavailable before upstream setup.',
      { cause: error, publicationStale: true }
    )
  }
}

/** Certify the original physical/routing owner for admitted post-push operations. */
export function verifyAssistedCommitPushOwner(
  destination: AssistedCommitPushDestination
): void {
  const original = originalOwnerProofs.get(destination)
  if (original === undefined) {
    throw new AssistedCommitPushError(
      'Original push ownership proof is unavailable',
      { publicationStale: true }
    )
  }
  try {
    original.verify()
  } catch (error) {
    if (
      !(error instanceof AssistedCommitFileVersionMismatchError) &&
      !(error instanceof AssistedCommitPushError && error.publicationStale)
    ) {
      throw error
    }
    throw new AssistedCommitPushError(
      'The original repository owner changed. Follow-up Git operations were stopped.',
      { cause: error, publicationStale: true }
    )
  }
}

/** Certify a requested alias without executing Git through that alias. */
export async function prepareAssistedCommitPushOwner(
  repository: Repository,
  destination: AssistedCommitPushDestination
): Promise<() => void> {
  try {
    if (
      destination.kind !== 'configured' ||
      repository.id !== destination.repositoryId ||
      (await realpath(repository.path)) !== destination.path
    ) {
      throw new AssistedCommitPushError(
        'The requested repository alias changed and no longer identifies the original checkout.',
        { publicationStale: true }
      )
    }
    const verifyAlias = await captureFileVersionFence([
      repository.path,
      join(repository.path, '.git'),
    ])
    const verify = () => {
      verifyAssistedCommitPushOwner(destination)
      try {
        verifyAlias()
        // eslint-disable-next-line no-sync
        if (realpathSync.native(repository.path) !== destination.path) {
          throw new AssistedCommitPushError(
            'The requested repository alias changed and no longer identifies the original checkout.',
            { publicationStale: true }
          )
        }
      } catch (error) {
        if (
          !(error instanceof AssistedCommitFileVersionMismatchError) &&
          !(isErrnoException(error) && error.code === 'ENOENT') &&
          !isAssistedCommitPathLayoutError(error)
        ) {
          throw error
        }
        throw new AssistedCommitPushError(
          'The requested repository alias changed. Follow-up Git operations were stopped.',
          { cause: error, publicationStale: true }
        )
      }
    }
    verify()
    return verify
  } catch (error) {
    if (
      error instanceof AssistedCommitFileVersionMismatchError ||
      (isErrnoException(error) && error.code === 'ENOENT') ||
      isAssistedCommitPathLayoutError(error)
    ) {
      throw new AssistedCommitPushError(
        'The requested repository alias is no longer available for refreshing pushed commits.',
        { cause: error, publicationStale: true }
      )
    }
    throw error
  }
}

interface IConfigEntry {
  readonly origin: string
  readonly key: string
  readonly value: string
}

function rebaseNativePath(base: string, path: string): string {
  const root = parse(path).root
  if (root.length > 0 && !isAbsolute(path)) {
    throw new AssistedCommitFileVersionMismatchError(path, {
      cause: new AssistedCommitPushError(
        'Drive-relative paths cannot be certified for assisted push. Use the normal Push action.'
      ),
    })
  }
  if (root === '\\' && /^[a-z]:/i.test(base)) {
    return `${base.slice(0, 2)}${path}`
  }
  return isAbsolute(path) ? path : `${base}${sep}${path}`
}

async function readRegularConfigurationInput(path: string) {
  try {
    if (!(await stat(path)).isFile()) {
      throw new AssistedCommitFileVersionMismatchError(path)
    }
    const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
    try {
      const held = await handle.stat()
      if (!held.isFile()) {
        throw new AssistedCommitFileVersionMismatchError(path)
      }
      const physical = await realpath(path)
      const bytes = await handle.readFile()
      const current = await lstat(physical)
      if (
        !current.isFile() ||
        current.dev !== held.dev ||
        current.ino !== held.ino
      ) {
        throw new AssistedCommitFileVersionMismatchError(path)
      }
      return { physical, bytes }
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return { physical: null, bytes: null }
    }
    if (isAssistedCommitPathLayoutError(error)) {
      throw new AssistedCommitFileVersionMismatchError(path, { cause: error })
    }
    throw error
  }
}

function readRegularConfigurationInputSync(path: string) {
  try {
    // eslint-disable-next-line no-sync
    if (!statSync(path).isFile()) {
      throw new AssistedCommitFileVersionMismatchError(path)
    }
    // eslint-disable-next-line no-sync
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK)
    try {
      // eslint-disable-next-line no-sync
      const held = fstatSync(descriptor)
      if (!held.isFile()) {
        throw new AssistedCommitFileVersionMismatchError(path)
      }
      // eslint-disable-next-line no-sync
      const physical = realpathSync.native(path)
      // eslint-disable-next-line no-sync
      const bytes = readFileSync(descriptor)
      // eslint-disable-next-line no-sync
      const current = lstatSync(physical)
      if (
        !current.isFile() ||
        current.dev !== held.dev ||
        current.ino !== held.ino
      ) {
        throw new AssistedCommitFileVersionMismatchError(path)
      }
      return { physical, bytes }
    } finally {
      // eslint-disable-next-line no-sync
      closeSync(descriptor)
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return { physical: null, bytes: null }
    }
    if (isAssistedCommitPathLayoutError(error)) {
      throw new AssistedCommitFileVersionMismatchError(path, { cause: error })
    }
    throw error
  }
}

async function readConfiguration(
  repository: Repository
): Promise<ReadonlyArray<IConfigEntry>> {
  const result = await git(
    ['config', '--null', '--list', '--show-origin', '--includes'],
    repository.path,
    'assistedPushConfiguration',
    { env: nativeConfigurationEnvironment }
  )
  const fields = result.stdout.split('\0').slice(0, -1)
  if (fields.length % 2 !== 0) {
    throw new Error('Git returned incomplete push configuration')
  }
  const entries: IConfigEntry[] = []
  for (let index = 0; index < fields.length; index += 2) {
    const entry = fields[index + 1]
    const separator = entry.indexOf('\n')
    entries.push({
      origin: fields[index],
      key: separator === -1 ? entry : entry.slice(0, separator),
      value: separator === -1 ? '' : entry.slice(separator + 1),
    })
  }
  return entries
}

function configurationInputs(
  repository: Repository,
  entries: ReadonlyArray<IConfigEntry>
): ReadonlyArray<string> {
  const files = entries
    .filter(entry => entry.origin.startsWith('file:'))
    .map(entry => rebaseNativePath(repository.path, entry.origin.slice(5)))
  const includes = entries
    .filter(
      entry =>
        entry.key === 'include.path' ||
        (entry.key.startsWith('includeif.') && entry.key.endsWith('.path'))
    )
    .map(entry => {
      if (entry.value.startsWith('%(prefix)/')) {
        throw new AssistedCommitPushError(
          'Runtime-prefix include paths cannot be certified for assisted push. Use the normal Push action.'
        )
      }
      const home = process.env.HOME ?? homedir()
      const value =
        entry.value === '~'
          ? home
          : entry.value.startsWith('~/')
          ? rebaseNativePath(home, entry.value.slice(2))
          : entry.value
      if (value.startsWith('~')) {
        throw new AssistedCommitPushError(
          'An included configuration path cannot be certified for assisted push. Use the normal Push action.'
        )
      }
      return rebaseNativePath(
        entry.origin.startsWith('file:')
          ? dirname(rebaseNativePath(repository.path, entry.origin.slice(5)))
          : repository.path,
        value
      )
    })
  return [...files, ...includes]
}

function destinationConfiguration(
  entries: ReadonlyArray<IConfigEntry>,
  branch: string,
  remote: string
): string {
  return JSON.stringify(
    entries
      .filter(
        entry =>
          entry.key.startsWith(`branch.${branch}.`) ||
          entry.key.startsWith(`remote.${remote}.`) ||
          entry.key.startsWith('url.') ||
          entry.key === 'remote.pushdefault'
      )
      .map(({ key, value }) => [key, value])
  )
}

/** Capture in-memory native environment authority without persisting its values. */
export function captureAssistedCommitPushEnvironment(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform
): { readonly full: string; readonly routing: string } {
  const variables: Array<[string, string | undefined]> = Object.entries(
    environment
  ).map(([name, value]) => [
    platform === 'win32' ? name.toUpperCase() : name,
    value,
  ])
  const full = JSON.stringify(
    variables
      .filter(
        ([key]) =>
          key.startsWith('GIT_') ||
          key === 'LOCAL_GIT_DIRECTORY' ||
          key === 'HOME' ||
          key === 'XDG_CONFIG_HOME'
      )
      .sort(([first], [second]) => first.localeCompare(second))
  )

  const routing = JSON.stringify(
    [
      'LOCAL_GIT_DIRECTORY',
      'GIT_DIR',
      'GIT_COMMON_DIR',
      'GIT_WORK_TREE',
      'GIT_OBJECT_DIRECTORY',
      'GIT_ALTERNATE_OBJECT_DIRECTORIES',
      'GIT_INDEX_FILE',
      'GIT_SHALLOW_FILE',
      'GIT_GRAFT_FILE',
      'GIT_REPLACE_REF_BASE',
      'GIT_NO_REPLACE_OBJECTS',
      'GIT_NAMESPACE',
      'GIT_CONFIG_SYSTEM',
      'GIT_CONFIG_GLOBAL',
      'GIT_CONFIG_NOSYSTEM',
      'GIT_CONFIG_PARAMETERS',
      'GIT_CONFIG_COUNT',
      'HOME',
      'XDG_CONFIG_HOME',
    ]
      .map(name => [name, variables.find(([key]) => key === name)?.[1]])
      .concat(
        variables
          .filter(
            ([name]) =>
              name.startsWith('GIT_CONFIG_KEY_') ||
              name.startsWith('GIT_CONFIG_VALUE_')
          )
          .sort(([first], [second]) => first.localeCompare(second))
      )
  )
  return { full, routing }
}

function gitEnvironment(): string {
  return captureAssistedCommitPushEnvironment(process.env).full
}

function gitRoutingEnvironment(): string {
  return captureAssistedCommitPushEnvironment(process.env).routing
}

async function readPushResources(repository: Repository) {
  const {
    paths: routingPaths,
    objectDirectories,
    objectRoutingDiagnostics,
  } = await getAssistedCommitProtectedResources(repository.path)
  // Native discovery can succeed while ignoring missing alternate targets.
  if (objectRoutingDiagnostics.length > 0) {
    throw new AssistedCommitFileVersionMismatchError(repository.path, {
      cause: new Error(objectRoutingDiagnostics),
    })
  }
  const resources = [
    ...new Set(await Promise.all(routingPaths.map(path => realpath(path)))),
  ].sort()
  const resourceIdentity = JSON.stringify(
    await Promise.all(
      resources.map(async path => {
        const stat = await lstat(path, { bigint: true })
        return [stat.dev, stat.ino, stat.mode & BigInt(0o170000)].join(':')
      })
    )
  )
  return { resources, resourceIdentity, routingPaths, objectDirectories }
}

async function readAlternateRoutingPaths(
  repository: Repository,
  objectDirectories: ReadonlyArray<string>
): Promise<ReadonlyArray<string>> {
  const environment = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES ?? ''
  const inputs = await Promise.all(
    objectDirectories.map(async directory => ({
      directory,
      ...(await readRegularConfigurationInput(
        join(directory, 'info', 'alternates')
      )),
    }))
  )
  const entries = [
    ...environment
      .split(delimiter)
      .filter(Boolean)
      .map(path => ({ base: repository.path, path })),
    ...inputs.flatMap(({ directory, bytes }) => {
      if (bytes === null) {
        return []
      }
      const text = bytes.toString('utf8')
      if (!Buffer.from(text).equals(bytes)) {
        throw new AssistedCommitFileVersionMismatchError(directory)
      }
      return text
        .split(/\r?\n/)
        .filter(path => path.length > 0 && !path.startsWith('#'))
        .map(path => ({ base: directory, path }))
    }),
  ]
  // Native discovery owns the graph. Only retain raw literal edges here;
  // ambiguous quoted lists require the ordinary Push action.
  if (
    environment.includes('"') ||
    entries.some(({ path }) => path.startsWith('"') || path.includes('\0'))
  ) {
    throw new AssistedCommitFileVersionMismatchError(repository.path, {
      cause: new AssistedCommitPushError(
        'Quoted alternate object routes cannot be certified for assisted push. Use the normal Push action.'
      ),
    })
  }
  return entries.map(({ base, path }) => rebaseNativePath(base, path))
}

async function readConfigurationFiles(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const results = await Promise.all(
    (['GIT_CONFIG_SYSTEM', 'GIT_CONFIG_GLOBAL'] as const).map(async name => {
      const override = process.env[name]
      const result = await git(
        ['var', name],
        repository.path,
        'assistedPushConfigurationPaths'
      )
      if (result.stdout.length === 0) {
        return []
      }
      if (override !== undefined) {
        if (
          result.stdout !== `${override}\n` &&
          result.stdout !== `${override}\r\n`
        ) {
          throw new AssistedCommitFileVersionMismatchError(override)
        }
        return [rebaseNativePath(repository.path, override)]
      }
      if (name === 'GIT_CONFIG_SYSTEM') {
        return [
          rebaseNativePath(
            repository.path,
            result.stdout.replace(__WIN32__ ? /\r?\n$/ : /\n$/, '')
          ),
        ]
      }
      // Default global paths share a line-delimited native output.
      const home = process.env.HOME ?? homedir()
      if (
        /[\r\n]/.test(home) ||
        /[\r\n]/.test(process.env.XDG_CONFIG_HOME ?? '')
      ) {
        throw new AssistedCommitFileVersionMismatchError(home)
      }
      return result.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map(path => rebaseNativePath(repository.path, path))
    })
  )
  return results.flat()
}

function originalPushBackingPaths(
  repository: Repository,
  destination: Extract<
    AssistedCommitPushDestination,
    { readonly kind: 'configured' }
  >
): ReadonlyArray<string> {
  return [
    repository.path,
    join(repository.path, '.git'),
    ...destination.resources,
    ...destination.routingPaths,
    destination.gitDirectory,
    destination.configurationFile,
    destination.configurationPath,
    destination.configurationAlias,
    destination.branchPath,
    destination.packedRefsPath,
    join(destination.gitDirectory, 'HEAD'),
    join(destination.gitDirectory, 'commondir'),
    join(destination.gitDirectory, 'gitdir'),
    join(destination.gitDirectory, 'config.worktree'),
  ]
}

async function readConfigValues(
  repository: Repository,
  name: string
): Promise<ReadonlyArray<string>> {
  const result = await git(
    ['config', '--null', '--get-all', '--', name],
    repository.path,
    'assistedPushConfigValues',
    {
      successExitCodes: new Set([0, 1]),
      env: nativeConfigurationEnvironment,
    }
  )
  return result.exitCode === 1 ? [] : result.stdout.split('\0').slice(0, -1)
}

/** Resolve the original branch's configured upstream, or Desktop's normal default remote. */
export async function readAssistedCommitPushDestination(
  repository: Repository,
  branchRef: string | null
): Promise<AssistedCommitPushDestination> {
  try {
    return await readAssistedCommitPushDestinationCore(repository, branchRef)
  } catch (error) {
    if (
      !(error instanceof AssistedCommitFileVersionMismatchError) &&
      !(error instanceof AssistedCommitError && error.code === 'busy')
    ) {
      throw error
    }
    return {
      kind: 'unavailable',
      error: new AssistedCommitPushError(
        'The push configuration could not be certified. Local commits will be kept. Review repository settings and use the normal Push action.',
        { cause: error }
      ),
    }
  }
}

async function readAssistedCommitPushDestinationCore(
  repository: Repository,
  branchRef: string | null
): Promise<AssistedCommitPushDestination> {
  if (
    (process.env.GIT_REPLACE_REF_BASE !== undefined &&
      process.env.GIT_REPLACE_REF_BASE !== 'refs/replace/') ||
    (process.env.GIT_NAMESPACE !== undefined &&
      process.env.GIT_NAMESPACE.length > 0)
  ) {
    return {
      kind: 'unavailable',
      error: new AssistedCommitPushError(
        'Custom replacement-ref or Git namespaces require review with the normal Push action. Local commits were kept.'
      ),
    }
  }
  if (branchRef === null || !branchRef.startsWith('refs/heads/')) {
    return {
      kind: 'unavailable',
      error: new AssistedCommitPushError(
        'Commits were kept locally. Check out a branch before using Push.'
      ),
    }
  }
  const branch = branchRef.slice('refs/heads/'.length)
  const [remoteValues, mergeValues] = await Promise.all([
    readConfigValues(repository, `branch.${branch}.remote`),
    readConfigValues(repository, `branch.${branch}.merge`),
  ])
  if (remoteValues.length > 1 || mergeValues.length > 1) {
    return {
      kind: 'unavailable',
      error: new AssistedCommitPushError(
        'Assisted push requires one configured upstream. Multiple upstream values require review with the normal Push action.'
      ),
    }
  }
  const upstreamRemote = remoteValues[0] ?? null
  const upstreamRef = mergeValues[0] ?? null
  const remotes = await getRemotes(repository, {
    env: nativeConfigurationEnvironment,
  })
  const remote =
    upstreamRemote === null
      ? findDefaultRemote(remotes)
      : remotes.find(candidate => candidate.name === upstreamRemote) ?? null
  if (remote === null) {
    return {
      kind: 'unavailable',
      error: new AssistedCommitPushError(
        'Commits were kept locally. Configure a remote and use the normal Push or Publish action.'
      ),
    }
  }
  if (
    (upstreamRemote === null) !== (upstreamRef === null) ||
    (upstreamRef !== null && !upstreamRef.startsWith('refs/heads/'))
  ) {
    return {
      kind: 'unavailable',
      error: new AssistedCommitPushError(
        'The branch has an unsupported upstream. Review its remote configuration and use the normal Push action.'
      ),
    }
  }
  const remoteRef = upstreamRef ?? branchRef
  const format = await git(
    ['check-ref-format', remoteRef],
    repository.path,
    'assistedPushRemoteRef',
    { successExitCodes: new Set([0, 1]) }
  )
  if (format.exitCode !== 0) {
    return {
      kind: 'unavailable',
      error: new AssistedCommitPushError(
        'The configured upstream branch name is invalid. Local commits were kept. Review repository settings and use the normal Push action.'
      ),
    }
  }
  const url = await git(
    ['remote', 'get-url', '--push', '--', remote.name],
    repository.path,
    'assistedPushURL',
    { successExitCodes: new Set([0, 2]) }
  )
  if (url.exitCode === 2) {
    return {
      kind: 'unavailable',
      error: new AssistedCommitPushError(
        'The configured remote is unavailable to assisted push. Local commits were kept. Review repository settings and use the normal Push action.',
        { cause: new Error(url.stderr.trim(), { cause: url }) }
      ),
    }
  }
  const urls = await git(
    ['remote', 'get-url', '--push', '--all', '--', remote.name],
    repository.path,
    'assistedPushURLs'
  )
  if (url.stdout !== urls.stdout || url.stdout.length <= 1) {
    return {
      kind: 'unavailable',
      error: new AssistedCommitPushError(
        'Assisted push requires one configured push destination. Use the normal Push action to review this remote.'
      ),
    }
  }
  const configuration = await readConfiguration(repository)
  try {
    configurationInputs(repository, configuration)
  } catch (error) {
    if (!(error instanceof AssistedCommitPushError)) {
      throw error
    }
    return { kind: 'unavailable', error }
  }
  const rawPushValues = await readConfigValues(
    repository,
    `remote.${remote.name}.pushurl`
  )
  const rawValues = rawPushValues.slice(rawPushValues.lastIndexOf('') + 1)
  const rawFetchValues = await readConfigValues(
    repository,
    `remote.${remote.name}.url`
  )
  const rawFetch = rawFetchValues.slice(rawFetchValues.lastIndexOf('') + 1)
  const rawPushURL = rawValues[0] ?? rawFetch[0]
  if (rawPushURL === undefined || rawPushURL.length === 0) {
    throw new AssistedCommitPushError(
      'The configured raw push URL is unavailable'
    )
  }
  const {
    resources,
    resourceIdentity,
    routingPaths,
    objectDirectories: discoveredObjectDirectories,
  } = await readPushResources(repository)
  const verifyAlternateFiles = await captureFileVersionFence(
    discoveredObjectDirectories.map(path => join(path, 'info', 'alternates'))
  )
  const alternateRoutingPaths = await readAlternateRoutingPaths(
    repository,
    discoveredObjectDirectories
  )
  const verifyAlternatePaths = await captureFileVersionFence(
    alternateRoutingPaths
  )
  const checkedAlternateRoutingPaths = await readAlternateRoutingPaths(
    repository,
    discoveredObjectDirectories
  )
  const verifyAlternateRouting = () => {
    verifyAlternateFiles()
    verifyAlternatePaths()
  }
  verifyAlternateRouting()
  if (
    JSON.stringify(checkedAlternateRoutingPaths) !==
    JSON.stringify(alternateRoutingPaths)
  ) {
    throw new AssistedCommitFileVersionMismatchError(repository.path, {
      cause: new AssistedCommitPushError(
        'Raw alternate object routes changed while preparing push.'
      ),
    })
  }
  const checkedResources = await readPushResources(repository)
  verifyAlternateRouting()
  if (
    JSON.stringify(checkedResources.routingPaths) !==
      JSON.stringify(routingPaths) ||
    checkedResources.resourceIdentity !== resourceIdentity
  ) {
    throw new AssistedCommitFileVersionMismatchError(repository.path, {
      cause: new AssistedCommitPushError(
        'The original Git object routing changed while preparing push.'
      ),
    })
  }
  const [
    gitDirectory,
    config,
    commonDirectory,
    branchPath,
    packedRefsPath,
    shallowPath,
    graftPath,
    replacementPath,
  ] = await Promise.all([
    git(
      ['rev-parse', '--absolute-git-dir'],
      repository.path,
      'assistedPushGitDirectory'
    ),
    git(
      ['rev-parse', '--path-format=absolute', '--git-path', 'config'],
      repository.path,
      'assistedPushConfigPath'
    ),
    git(
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      repository.path,
      'assistedPushCommonDirectory'
    ),
    git(
      ['rev-parse', '--path-format=absolute', '--git-path', branchRef],
      repository.path,
      'assistedPushBranchPath'
    ),
    git(
      ['rev-parse', '--path-format=absolute', '--git-path', 'packed-refs'],
      repository.path,
      'assistedPushPackedRefsPath'
    ),
    git(
      ['rev-parse', '--path-format=absolute', '--git-path', 'shallow'],
      repository.path,
      'assistedPushShallowPath'
    ),
    git(
      ['rev-parse', '--path-format=absolute', '--git-path', 'info/grafts'],
      repository.path,
      'assistedPushGraftPath'
    ),
    git(
      ['rev-parse', '--path-format=absolute', '--git-path', 'refs/replace'],
      repository.path,
      'assistedPushReplacementPath'
    ),
  ])
  const configurationFile = config.stdout.replace(/\r?\n$/, '')
  const canonicalGitDirectory = await realpath(
    gitDirectory.stdout.replace(/\r?\n$/, '')
  )
  const configurationPath = await realpath(configurationFile)
  const canonicalCommonDirectory = await realpath(
    commonDirectory.stdout.replace(/\r?\n$/, '')
  )
  const shallowPaths = [
    join(canonicalGitDirectory, 'shallow'),
    join(canonicalCommonDirectory, 'shallow'),
    shallowPath.stdout.replace(/\r?\n$/, ''),
    ...(process.env.GIT_SHALLOW_FILE === undefined
      ? []
      : [rebaseNativePath(repository.path, process.env.GIT_SHALLOW_FILE)]),
  ]
  const mutableMetadata = [
    join(canonicalGitDirectory, 'index'),
    join(canonicalGitDirectory, 'FETCH_HEAD'),
    join(canonicalCommonDirectory, 'packed-refs'),
    packedRefsPath.stdout.replace(/\r?\n$/, ''),
    ...shallowPaths,
    ...(process.env.GIT_INDEX_FILE === undefined
      ? []
      : [rebaseNativePath(repository.path, process.env.GIT_INDEX_FILE)]),
  ]
  const verifyMutableMetadata = await captureMutableFileRoutingFence(
    mutableMetadata
  ).catch(error => {
    if (
      isErrnoException(error) &&
      error.code === 'ENOENT' &&
      'path' in error &&
      typeof error.path === 'string' &&
      shallowPaths.some(path => dirname(path) === error.path)
    ) {
      throw new AssistedCommitFileVersionMismatchError(repository.path, {
        cause: error,
      })
    }
    throw error
  })
  const graftPaths = [
    graftPath.stdout.replace(/\r?\n$/, ''),
    ...(process.env.GIT_GRAFT_FILE === undefined
      ? []
      : [rebaseNativePath(repository.path, process.env.GIT_GRAFT_FILE)]),
  ]
  const objectDirectories = discoveredObjectDirectories
  const verifyObjectRouting = await captureObjectDirectoryRoutingFence(
    await Promise.all(objectDirectories.map(path => realpath(path)))
  )
  const verifyHeadCondition = await captureFileVersionFence([
    join(canonicalGitDirectory, 'HEAD'),
  ])
  const headCondition = await readRegularConfigurationInput(
    join(canonicalGitDirectory, 'HEAD')
  )
  if (
    headCondition.bytes?.toString('utf8').replace(/\r?\n$/, '') !==
    `ref: ${branchRef}`
  ) {
    throw new AssistedCommitFileVersionMismatchError(repository.path, {
      cause: new AssistedCommitPushError(
        'Symbolic branch aliases cannot be certified for assisted push. Use the normal Push action.'
      ),
    })
  }
  const verifyBranchCondition = () => {
    const { bytes } = readRegularConfigurationInputSync(
      branchPath.stdout.replace(/\r?\n$/, '')
    )
    if (bytes !== null && bytes.toString('utf8').startsWith('ref:')) {
      throw new AssistedCommitFileVersionMismatchError(repository.path, {
        cause: new AssistedCommitPushError(
          'The committed branch became a symbolic alias before follow-up work.'
        ),
      })
    }
  }
  const verifyRefRouting = await captureMutableTreeRoutingFence([
    join(canonicalGitDirectory, 'refs'),
    join(canonicalGitDirectory, 'logs'),
    join(canonicalCommonDirectory, 'refs'),
    join(canonicalCommonDirectory, 'logs'),
  ])
  const verifyReplacementHistory = () => {
    const pending = [replacementPath.stdout.replace(/\r?\n$/, '')]
    while (pending.length > 0) {
      const path = pending.pop()
      if (path === undefined) {
        break
      }
      try {
        // eslint-disable-next-line no-sync
        if (!lstatSync(path).isDirectory()) {
          throw new AssistedCommitFileVersionMismatchError(path)
        }
        // eslint-disable-next-line no-sync
        pending.push(...readdirSync(path).map(name => join(path, name)))
      } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
          continue
        }
        throw error
      }
    }
    const packed = readRegularConfigurationInputSync(
      packedRefsPath.stdout.replace(/\r?\n$/, '')
    )
    if (
      packed.bytes
        ?.toString('utf8')
        .split(/\r?\n/)
        .some(line =>
          line.slice(line.indexOf(' ') + 1).startsWith('refs/replace/')
        )
    ) {
      throw new AssistedCommitFileVersionMismatchError(
        packedRefsPath.stdout.replace(/\r?\n$/, '')
      )
    }
  }
  const admittedMetadata = await Promise.all(
    [...new Set([...mutableMetadata, ...graftPaths, configurationPath])].map(
      async path => {
        try {
          return join(await realpath(dirname(path)), basename(path))
        } catch (error) {
          if (
            (graftPaths.includes(path) || shallowPaths.includes(path)) &&
            isErrnoException(error) &&
            error.code === 'ENOENT'
          ) {
            throw new AssistedCommitFileVersionMismatchError(path, {
              cause: error,
            })
          }
          throw error
        }
      }
    )
  )
  const destination = Object.freeze({
    kind: 'configured',
    repositoryId: repository.id,
    path: await realpath(repository.path),
    resources: Object.freeze(resources),
    routingPaths: Object.freeze([
      ...new Set([
        ...routingPaths,
        ...objectDirectories,
        ...alternateRoutingPaths,
        ...(process.env.GIT_OBJECT_DIRECTORY === undefined
          ? [join(canonicalCommonDirectory, 'objects')]
          : []),
        ...[
          'GIT_DIR',
          'GIT_COMMON_DIR',
          'GIT_WORK_TREE',
          'GIT_OBJECT_DIRECTORY',
        ].flatMap(name => {
          const path = process.env[name]
          return path === undefined
            ? []
            : [rebaseNativePath(repository.path, path)]
        }),
        ...configuration
          .filter(entry => entry.key === 'core.worktree')
          .map(entry => rebaseNativePath(canonicalGitDirectory, entry.value)),
      ]),
    ]),
    resourceIdentity,
    admissionPaths: Object.freeze(
      admittedMetadata.flatMap(path => [path, `${path}.lock`])
    ),
    branchRef,
    remoteRef,
    remote: Object.freeze({ ...remote }),
    pushURL: url.stdout.slice(0, -1),
    rawPushURL,
    pushURLSource: rawValues.length > 0 ? 'push-url' : 'fetch-url',
    gitDirectory: canonicalGitDirectory,
    configurationFile,
    configurationPath,
    configurationAlias: join(canonicalCommonDirectory, 'config'),
    branchPath: branchPath.stdout.replace(/\r?\n$/, ''),
    packedRefsPath: packedRefsPath.stdout.replace(/\r?\n$/, ''),
    publishBranch: upstreamRef === null,
    configuration: destinationConfiguration(configuration, branch, remote.name),
  })
  const routing = gitRoutingEnvironment()
  assertAssistedCommitGitResourceAdmission(
    repository.path,
    destination.admissionPaths
  )
  const verifyOwner = await captureFileVersionFence([
    repository.path,
    join(repository.path, '.git'),
    ...destination.resources,
    ...destination.routingPaths,
    destination.gitDirectory,
    join(destination.gitDirectory, 'commondir'),
    join(destination.gitDirectory, 'gitdir'),
    ...graftPaths,
    ...graftPaths.map(path => dirname(path)),
  ])
  const configurationPaths = [
    ...new Set([
      destination.configurationFile,
      destination.configurationPath,
      destination.configurationAlias,
      join(destination.gitDirectory, 'config.worktree'),
      ...(await readConfigurationFiles(repository)),
      ...configurationInputs(repository, configuration),
    ]),
  ]
  const verifyConfigurationVersions = await captureFileVersionFence(
    configurationPaths
  )
  const inputs = await Promise.all(
    configurationPaths.map(async path => ({
      path,
      ...(await readRegularConfigurationInput(path)),
    }))
  )
  const checkedConfiguration = await readConfiguration(repository)
  verifyConfigurationVersions()
  verifyOwner()
  verifyMutableMetadata()
  verifyRefRouting()
  verifyReplacementHistory()
  verifyObjectRouting()
  verifyAlternateRouting()
  verifyHeadCondition()
  verifyBranchCondition()
  if (JSON.stringify(checkedConfiguration) !== JSON.stringify(configuration)) {
    throw new AssistedCommitFileVersionMismatchError(repository.path, {
      cause: new AssistedCommitPushError(
        'Configuration dependencies changed while freezing push ownership.'
      ),
    })
  }
  originalOwnerProofs.set(destination, {
    verify: () => {
      if (gitRoutingEnvironment() !== routing) {
        throw new AssistedCommitPushError(
          'The original Git repository routing environment changed',
          { publicationStale: true }
        )
      }
      verifyOwner()
      verifyMutableMetadata()
      verifyRefRouting()
      verifyReplacementHistory()
      verifyObjectRouting()
      verifyAlternateRouting()
      verifyHeadCondition()
      verifyBranchCondition()
      for (const input of inputs) {
        const { physical, bytes } = readRegularConfigurationInputSync(
          input.path
        )
        if (
          physical !== input.physical ||
          (input.bytes === null
            ? bytes !== null
            : bytes === null || !bytes.equals(input.bytes))
        ) {
          throw new AssistedCommitFileVersionMismatchError(input.path)
        }
      }
    },
    acceptConfiguration: bytes => {
      for (const input of inputs) {
        if (input.physical === destination.configurationPath) {
          input.bytes = Buffer.from(bytes)
        }
      }
    },
  })
  return destination
}

/**
 * Complete only the original published branch's tracking metadata.
 *
 * Both tracking keys install together under the native configuration lock.
 * Failed metadata work is retryable without repeating network push.
 */
export async function completeAssistedCommitPushPublication(
  repository: Repository,
  destination: AssistedCommitPushDestination,
  head: IAssistedCommitHead,
  owned: IAssistedCommitPublicationResources
): Promise<void> {
  await cleanupAssistedCommitPublication(owned)
  if (destination.kind !== 'configured' || !destination.publishBranch) {
    throw new AssistedCommitPushError(
      'The original publication intent is unavailable'
    )
  }
  try {
    const original = originalOwnerProofs.get(destination)
    if (original === undefined) {
      throw new AssistedCommitPushError(
        'Original publication ownership proof is unavailable',
        { publicationStale: true }
      )
    }
    original.verify()
  } catch (error) {
    if (
      !(error instanceof AssistedCommitFileVersionMismatchError) &&
      !(error instanceof AssistedCommitPushError && error.publicationStale)
    ) {
      throw error
    }
    throw new AssistedCommitPushError(
      'Commits were pushed, but the original repository owner is no longer available for upstream setup.',
      { cause: error, publicationStale: true }
    )
  }
  const environment = gitEnvironment()
  const verifyOwner = await capturePublicationFileVersionFence(
    originalPushBackingPaths(repository, destination)
  )
  const configurationFiles = await readConfigurationFiles(repository)
  const verifyDefaultConfiguration = await capturePublicationFileVersionFence(
    configurationFiles
  )
  const verifyOriginalOwner = () => {
    try {
      if (gitEnvironment() !== environment) {
        throw new AssistedCommitPushError(
          'Git environment changed during publication setup',
          { publicationStale: true }
        )
      }
      verifyOwner()
      verifyDefaultConfiguration()
    } catch (error) {
      if (
        !(error instanceof AssistedCommitFileVersionMismatchError) &&
        !(error instanceof AssistedCommitPushError && error.publicationStale)
      ) {
        throw error
      }
      throw new AssistedCommitPushError(
        'Commits were pushed, but the original repository or configuration changed before upstream setup.',
        { cause: error, publicationStale: true }
      )
    }
  }
  const resources = await readPushResources(repository).catch(error => {
    if (!isGitError(error, DugiteError.NotAGitRepository)) {
      throw error
    }
    throw new AssistedCommitPushError(
      'Commits were pushed, but the original repository metadata is no longer available for upstream setup.',
      { cause: error, publicationStale: true }
    )
  })
  const currentHead = await readAssistedCommitHead(repository).catch(error => {
    if (
      !(
        (error instanceof AssistedCommitError &&
          error.code === 'unsafe-selection') ||
        isGitError(error, DugiteError.NotAGitRepository)
      )
    ) {
      throw error
    }
    throw new AssistedCommitPushError(
      'Commits were pushed, but the original branch now has an unsupported HEAD or ref layout. Review the repository and use the normal Push action.',
      { cause: error, publicationStale: true }
    )
  })
  const remote = (
    await getRemotes(repository, { env: nativeConfigurationEnvironment })
  ).find(remote => remote.name === destination.remote.name)
  if (remote === undefined) {
    throw new AssistedCommitPushError(
      'Commits were pushed, but the original remote was removed before upstream setup. Review repository settings.',
      { publicationStale: true }
    )
  }
  const url = await git(
    ['remote', 'get-url', '--push', '--all', '--', destination.remote.name],
    repository.path,
    'assistedPublicationURL',
    { successExitCodes: new Set([0, 2]) }
  )
  if (url.exitCode === 2) {
    throw new AssistedCommitPushError(
      'Commits were pushed, but the original remote is no longer available for automatic upstream setup. Review repository settings and use the normal Push action.',
      {
        cause: new Error(url.stderr.trim(), { cause: url }),
        publicationStale: true,
      }
    )
  }
  if (
    repository.id !== destination.repositoryId ||
    (await realpath(repository.path)) !== destination.path ||
    JSON.stringify(resources.resources) !==
      JSON.stringify(destination.resources) ||
    resources.resourceIdentity !== destination.resourceIdentity ||
    currentHead.ref !== head.ref ||
    currentHead.sha !== head.sha ||
    remote?.url !== destination.remote.url ||
    url.stdout !== `${destination.pushURL}\n`
  ) {
    throw new AssistedCommitPushError(
      'Commits were pushed, but the original branch, repository, or destination changed before upstream setup.',
      { publicationStale: true }
    )
  }
  const branch = destination.branchRef.slice('refs/heads/'.length)
  const keys = [
    { name: `branch.${branch}.remote`, expected: destination.remote.name },
    { name: `branch.${branch}.merge`, expected: destination.remoteRef },
  ]
  const config = await git(
    ['rev-parse', '--path-format=absolute', '--git-path', 'config'],
    repository.path,
    'assistedPublicationConfigPath'
  )
  verifyOriginalOwner()
  const configPath = await realpath(config.stdout.replace(/\r?\n$/, ''))
  if (configPath !== destination.configurationPath) {
    throw new AssistedCommitPushError(
      'The original publication configuration owner changed. Review repository settings.',
      { publicationStale: true }
    )
  }
  const mode = (await lstat(configPath)).mode & 0o777
  verifyOriginalOwner()
  let failed = false
  let failure: unknown
  try {
    const lock = await acquireOwnedFileLock(
      `${configPath}.lock`,
      mode,
      ownedLock => owned.locks.push(ownedLock)
    )
    const entries = await readConfiguration(repository)
    const inputs = (() => {
      try {
        return configurationInputs(repository, entries)
      } catch (error) {
        if (!(error instanceof AssistedCommitPushError)) {
          throw error
        }
        throw new AssistedCommitPushError(
          'Commits were pushed, but included configuration no longer supports automatic upstream setup. Use the normal Push action.',
          { cause: error, publicationStale: true }
        )
      }
    })()
    const verify = await capturePublicationFileVersionFence([
      config.stdout.replace(/\r?\n$/, ''),
      configPath,
      ...inputs,
    ])
    const checkedEntries = await readConfiguration(repository)
    if (JSON.stringify(checkedEntries) !== JSON.stringify(entries)) {
      throw new AssistedCommitPushError(
        'Configuration dependencies changed during publication setup. Review repository settings.',
        { publicationStale: true }
      )
    }
    const verifyConfiguration = () => {
      verifyOriginalOwner()
      try {
        verify()
      } catch (error) {
        if (!(error instanceof AssistedCommitFileVersionMismatchError)) {
          throw error
        }
        throw new AssistedCommitPushError(
          'The published branch configuration changed before upstream setup. Review repository settings.',
          { cause: error, publicationStale: true }
        )
      }
    }
    const values = await Promise.all(
      keys.map(key => readConfigValues(repository, key.name))
    )
    if (
      values.some(
        (value, index) =>
          value.length > 1 ||
          (value[0] !== undefined && value[0] !== keys[index].expected)
      )
    ) {
      throw new AssistedCommitPushError(
        'The published branch tracking choice changed. Review repository settings before retrying refresh.',
        { publicationStale: true }
      )
    }
    const missing = keys.filter((_, index) => values[index].length === 0)
    if (missing.length === 0) {
      verifyConfiguration()
      return
    }
    const input = await readRegularConfigurationInput(configPath)
    verifyConfiguration()
    if (input.physical !== configPath || input.bytes === null) {
      throw new AssistedCommitFileVersionMismatchError(configPath)
    }
    const staged = Buffer.concat([
      input.bytes,
      Buffer.from(
        `\n[branch "${quoteConfig(branch)}"]\n${missing
          .map(
            key =>
              `\t${key.name.slice(
                key.name.lastIndexOf('.') + 1
              )} = "${quoteConfig(key.expected)}"\n`
          )
          .join('')}`
      ),
    ])
    for (const key of missing) {
      const parsed = await git(
        [
          'config',
          '--no-includes',
          '--null',
          '--file',
          '-',
          '--get-all',
          '--',
          key.name,
        ],
        repository.path,
        'assistedPublicationUpstream',
        { stdin: staged, env: nativeConfigurationEnvironment }
      )
      if (parsed.stdout !== `${key.expected}\0`) {
        throw new Error(
          'Git could not validate the original branch tracking configuration'
        )
      }
    }
    await lock.handle.writeFile(staged)
    await lock.handle.chmod(mode)
    await lock.handle.sync()
    const held = await lstat(lock.path)
    if (held.dev !== lock.stat.dev || held.ino !== lock.stat.ino) {
      throw new Error('Publication configuration lock was replaced')
    }
    verifyConfiguration()
    await lock.handle.close()
    lock.closed = true
    verifyConfiguration()
    // eslint-disable-next-line no-sync
    const closedLock = lstatSync(lock.path)
    if (
      !closedLock.isFile() ||
      closedLock.isSymbolicLink() ||
      closedLock.dev !== lock.stat.dev ||
      closedLock.ino !== lock.stat.ino ||
      (closedLock.mode & 0o777) !== mode
    ) {
      throw new Error(
        'Publication configuration lock changed before installation'
      )
    }
    // eslint-disable-next-line no-sync
    const descriptor = openSync(
      lock.path,
      constants.O_RDONLY | constants.O_NONBLOCK
    )
    try {
      // eslint-disable-next-line no-sync
      const reading = fstatSync(descriptor)
      if (
        !reading.isFile() ||
        reading.dev !== lock.stat.dev ||
        reading.ino !== lock.stat.ino ||
        (reading.mode & 0o777) !== mode ||
        reading.size !== staged.length ||
        // eslint-disable-next-line no-sync
        !readFileSync(descriptor).equals(staged)
      ) {
        throw new Error(
          'Publication configuration lock changed before installation'
        )
      }
      // eslint-disable-next-line no-sync
      const current = lstatSync(lock.path)
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        current.dev !== reading.dev ||
        current.ino !== reading.ino ||
        current.mode !== reading.mode ||
        current.size !== reading.size ||
        current.mtimeMs !== reading.mtimeMs ||
        current.ctimeMs !== reading.ctimeMs
      ) {
        throw new Error(
          'Publication configuration lock changed before installation'
        )
      }
    } finally {
      // eslint-disable-next-line no-sync
      closeSync(descriptor)
    }
    await rename(lock.path, configPath)
    lock.consumed = true
    const original = originalOwnerProofs.get(destination)
    if (original === undefined) {
      throw new Error('Accepted publication lost its original ownership proof')
    }
    original.acceptConfiguration(staged)
  } catch (error) {
    failed = true
    failure =
      error instanceof AssistedCommitFileVersionMismatchError
        ? new AssistedCommitPushError(
            'The published branch configuration changed before upstream setup. Review repository settings.',
            { cause: error, publicationStale: true }
          )
        : error
    throw failure
  } finally {
    try {
      await cleanupAssistedCommitPublication(owned)
    } catch (error) {
      throw new AggregateError(
        failed ? [failure, error] : [error],
        'Publication metadata and cleanup need attention'
      )
    }
  }
}

/**
 * Verify a frozen push intent under its caller's Git lease.
 *
 * The synchronous return closes config, environment, path, HEAD and ref sampling
 * before native spawn. The actual refspec uses the full frozen SHA, never live HEAD.
 */
export async function prepareAssistedCommitPushDestination(
  requestedRepository: Repository,
  destination: AssistedCommitPushDestination,
  head: IAssistedCommitHead
): Promise<() => void> {
  if (destination.kind === 'unavailable') {
    throw destination.error
  }
  const original = originalOwnerProofs.get(destination)
  if (original === undefined) {
    throw new AssistedCommitPushError(
      'Original push ownership proof is unavailable'
    )
  }
  let verifyRequested: () => void
  try {
    original.verify()
    verifyRequested = await prepareAssistedCommitPushOwner(
      requestedRepository,
      destination
    )
  } catch (error) {
    throw new AssistedCommitPushError(
      'The original repository or push destination changed. Local commits were kept. Review repository settings.',
      { cause: error }
    )
  }
  const repository =
    requestedRepository.path === destination.path
      ? requestedRepository
      : new Repository(
          destination.path,
          requestedRepository.id,
          requestedRepository.gitHubRepository,
          requestedRepository.missing,
          requestedRepository.alias,
          requestedRepository.workflowPreferences,
          requestedRepository.isTutorialRepository,
          requestedRepository.gitDir,
          requestedRepository.mainWorktreePath
        )
  const environment = gitEnvironment()
  const verifyOwner = await captureFileVersionFence(
    originalPushBackingPaths(repository, destination)
  )
  const entries = await readConfiguration(repository)
  const configurationFiles = await readConfigurationFiles(repository)
  const paths = await Promise.all(
    ['config', 'config.worktree', 'packed-refs', destination.branchRef].map(
      async name => {
        const result = await git(
          ['rev-parse', '--path-format=absolute', '--git-path', name],
          repository.path,
          'assistedPushBackingPath'
        )
        return result.stdout.replace(/\r?\n$/, '')
      }
    )
  )
  const verifyFiles = await captureFileVersionFence([
    ...paths,
    ...configurationFiles,
    ...configurationInputs(repository, entries),
  ])
  const checkedEntries = await readConfiguration(repository)
  if (JSON.stringify(checkedEntries) !== JSON.stringify(entries)) {
    throw new AssistedCommitPushError(
      'Configuration dependencies changed before push entry. Local commits were kept. Review repository settings.'
    )
  }
  const current = await readAssistedCommitPushDestination(
    repository,
    destination.branchRef
  )
  const currentHead = await readAssistedCommitHead(repository)
  if (
    current.kind !== 'configured' ||
    repository.id !== destination.repositoryId ||
    current.path !== destination.path ||
    JSON.stringify(current.resources) !==
      JSON.stringify(destination.resources) ||
    current.resourceIdentity !== destination.resourceIdentity ||
    current.branchRef !== destination.branchRef ||
    current.remoteRef !== destination.remoteRef ||
    current.remote.name !== destination.remote.name ||
    current.remote.url !== destination.remote.url ||
    current.pushURL !== destination.pushURL ||
    current.rawPushURL !== destination.rawPushURL ||
    current.pushURLSource !== destination.pushURLSource ||
    current.gitDirectory !== destination.gitDirectory ||
    current.configurationFile !== destination.configurationFile ||
    current.configurationPath !== destination.configurationPath ||
    current.configurationAlias !== destination.configurationAlias ||
    current.branchPath !== destination.branchPath ||
    current.packedRefsPath !== destination.packedRefsPath ||
    current.configuration !== destination.configuration ||
    currentHead.ref !== head.ref ||
    currentHead.sha !== head.sha
  ) {
    throw new AssistedCommitPushError(
      'The original branch, commit, repository, or push destination changed. Local commits were kept. Review the repository and use the normal Push action.'
    )
  }
  const pinned = await git(
    ['remote', 'get-url', '--push', '--all', '--', destination.remote.name],
    repository.path,
    'assistedPushPinnedURL',
    {
      env: {
        GIT_CONFIG_PARAMETERS: getAssistedCommitPushConfigParameters(
          destination.remote.name,
          destination.rawPushURL,
          destination.pushURLSource
        ),
      },
    }
  )
  if (pinned.stdout !== `${destination.pushURL}\n`) {
    throw new AssistedCommitPushError(
      'The configured URL cannot be preserved for assisted push. Local commits were kept. Review repository settings.'
    )
  }
  return function verifyPushDestinationSync() {
    if (gitEnvironment() !== environment) {
      throw new AssistedCommitPushError(
        'Git environment changed before push entry'
      )
    }
    try {
      verifyRequested()
      original.verify()
      verifyOwner()
      verifyFiles()
    } catch (error) {
      throw new AssistedCommitPushError(
        'Repository or push configuration changed before push entry. Local commits were kept.',
        { cause: error }
      )
    }
  }
}
