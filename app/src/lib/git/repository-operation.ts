import { realpath } from 'fs/promises'
import { basename, dirname, resolve, sep } from 'path'
import { git } from './core'
import { isErrnoException } from '../errno-exception'
import { AssistedCommitError } from './assisted-commit/error'
import { createRepositoryOperationContext } from './repository-operation-context'

interface IRepositoryOperation {
  readonly kind: 'read' | 'mutation'
  readonly done: Promise<void>
  readonly complete: () => void
}

interface IRepositoryLease {
  readonly released: Promise<void>
  readonly release: () => void
}

interface IRepositoryOperations {
  readonly path: string
  readonly aliases: Set<string>
  readonly operations: Set<IRepositoryOperation>
  waiters: number
  readonly protectedPaths: Set<string>
  lease?: IRepositoryLease
}

interface IRepositoryOperationContext {
  readonly repository: IRepositoryOperations
  readonly owner: IRepositoryLease | IRepositoryOperation
  readonly readOnly?: boolean
  readonly parent?: IRepositoryOperationContext
  readonly propagateErrors?: boolean
  readonly beforeSpawn?: () => void
}

/** Exclusive Desktop Git ownership, retained until completion or verified recovery. */
export interface IAssistedCommitGitLease {
  /** Run transaction work without granting its observers Git ownership. */
  readonly run: <T>(
    operation: () => Promise<T>,
    readOnly?: boolean
  ) => Promise<T>
  /** Resume deferred readers. Only call after all owned Git work has settled. */
  readonly release: () => void
}

/** Physical protection outlives the Git lease while selection readers settle. */
export interface IRepositoryGitResourceProtection {
  /** Release only after verified settlement or explicit recovery ownership release. */
  readonly release: () => void
}

const contexts = createRepositoryOperationContext<IRepositoryOperationContext>()
const repositories = new Map<string, IRepositoryOperations>()
const destructiveOperations = new Map<string, object>()
const destructiveContexts =
  createRepositoryOperationContext<ReadonlyMap<string, object>>()
const repositoryResourcePaths = new Map<string, ReadonlyArray<string>>()
const resourceProtections = new Set<ReadonlySet<string>>()
const resourceProtectionOwners = new WeakMap<
  ReadonlySet<string>,
  ReadonlySet<string>
>()
const protectionIdentities = new WeakMap<
  IRepositoryGitResourceProtection,
  ReadonlySet<string>
>()
const mutationReservations = new Set<ReadonlySet<string>>()

function pendingOperation(
  kind: 'read' | 'mutation' = 'read'
): IRepositoryOperation {
  let complete: () => void = () => {}
  const done = new Promise<void>(resolve => {
    complete = resolve
  })
  return { kind, done, complete }
}

function pathKey(path: string): string {
  const absolute = resolve(path)
  return __WIN32__ ? absolute.toLowerCase() : absolute
}

function lookup(path: string): IRepositoryOperations | undefined {
  const key = pathKey(path)
  return (
    repositories.get(key) ??
    [...new Set(repositories.values())].find(repository =>
      [...repository.aliases].some(alias => containsPath(alias, key))
    )
  )
}

async function repositoryOperations(
  path: string
): Promise<IRepositoryOperations> {
  const existing = lookup(path)
  if (existing !== undefined) {
    return existing
  }
  const canonical = await realpath(path).catch(error => {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return resolve(path)
    }
    throw error
  })
  const key = pathKey(canonical)
  const repository = repositories.get(key) ?? {
    path: canonical,
    aliases: new Set<string>(),
    operations: new Set<IRepositoryOperation>(),
    waiters: 0,
    protectedPaths: new Set<string>(),
  }
  for (const alias of [key, pathKey(path)]) {
    repository.aliases.add(alias)
    repositories.set(alias, repository)
  }
  return repository
}

function forget(repository: IRepositoryOperations): void {
  if (
    repository.lease !== undefined ||
    repository.operations.size > 0 ||
    repository.waiters > 0
  ) {
    return
  }
  for (const alias of repository.aliases) {
    if (repositories.get(alias) === repository) {
      repositories.delete(alias)
    }
  }
}

function hasAccess(repository: IRepositoryOperations): boolean {
  let context = contexts.getStore()
  while (context !== undefined) {
    if (
      context.repository === repository &&
      (context.owner === repository.lease ||
        ('done' in context.owner && repository.operations.has(context.owner)))
    ) {
      return true
    }
    context = context.parent
  }
  return false
}

/** Whether readers should coalesce and UI mutations should be disabled. */
export function isRepositoryGitPaused(path: string): boolean {
  const repository = lookup(path)
  return repository?.lease !== undefined && !hasAccess(repository)
}

/** Internal callers already admitted before the lease must be allowed to finish draining. */
export function hasRepositoryGitOperationAccess(path: string): boolean {
  const repository = lookup(path)
  return repository !== undefined && hasAccess(repository)
}

/** Reject competing Desktop mutations, including non-Git work preceding a command. */
export function assertRepositoryGitAvailable(path: string): void {
  if (isRepositoryGitPaused(path)) {
    throw new AssistedCommitError(
      'busy',
      'Finish or cancel the assisted commit run before changing this repository'
    )
  }
}

function containsPath(parent: string, child: string): boolean {
  return (
    child === parent ||
    child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`)
  )
}

/** Root-safe ancestry comparison for canonical resource admission and UI guards. */
export function repositoryPathsOverlap(first: string, second: string): boolean {
  const left = pathKey(first)
  const right = pathKey(second)
  return containsPath(left, right) || containsPath(right, left)
}

/** A filesystem removal must not erase another run's working files or shared metadata. */
export function assertRepositoryGitDestructionAvailable(path: string): void {
  const key = pathKey(path)
  if (
    [...resourceProtections].some(paths =>
      [...paths].some(
        protectedPath =>
          containsPath(key, protectedPath) || containsPath(protectedPath, key)
      )
    ) ||
    [...new Set(repositories.values())].some(
      repository =>
        repository.lease !== undefined &&
        [...repository.protectedPaths, ...repository.aliases].some(
          protectedPath =>
            containsPath(key, protectedPath) || containsPath(protectedPath, key)
        )
    )
  ) {
    throw new AssistedCommitError(
      'busy',
      'An assisted commit run depends on files or Git metadata in this directory'
    )
  }
}

/** UI and background admission for overlapping active worktrees or shared Git metadata. */
export function isRepositoryAffectedByAssistedCommit(path: string): boolean {
  const paths = repositoryResourcePaths.get(pathKey(path)) ?? [path]
  return (
    [...resourceProtections].some(protectedPaths =>
      paths.some(path =>
        [...protectedPaths].some(
          protectedPath =>
            containsPath(pathKey(path), protectedPath) ||
            containsPath(protectedPath, pathKey(path))
        )
      )
    ) ||
    [...new Set(repositories.values())].some(
      repository =>
        repository.lease !== undefined &&
        [...repository.protectedPaths, ...repository.aliases].some(
          protectedPath =>
            paths.some(
              path =>
                containsPath(pathKey(path), protectedPath) ||
                containsPath(protectedPath, pathKey(path))
            )
        )
    )
  )
}

/** Reserve working files and shared metadata without preventing read-only reconciliation. */
export function protectAssistedCommitResources(
  path: string,
  paths: ReadonlyArray<string> = repositoryResourcePaths.get(pathKey(path)) ?? [
    path,
  ],
  originalProtection?: IRepositoryGitResourceProtection
): IRepositoryGitResourceProtection {
  const protection = new Set(paths.map(pathKey))
  const ownerPaths = repositoryResourcePaths.get(pathKey(path))
  const canonicalOwner = ownerPaths?.[ownerPaths.length / 2]
  const originalOwner =
    originalProtection === undefined
      ? undefined
      : protectionIdentities.get(originalProtection)
  if (originalProtection !== undefined && originalOwner === undefined) {
    throw new Error('Original repository resource protection is unavailable')
  }
  const identity = originalOwner ?? new Set([pathKey(canonicalOwner ?? path)])
  resourceProtectionOwners.set(protection, identity)
  resourceProtections.add(protection)
  const handle = { release: () => resourceProtections.delete(protection) }
  protectionIdentities.set(handle, identity)
  return handle
}

/** Reject assisted admission before it can interrupt a pre-admitted mutation. */
export function isRepositoryGitMutationInProgress(path: string): boolean {
  const paths = (repositoryResourcePaths.get(pathKey(path)) ?? [path]).map(
    pathKey
  )
  const overlaps = (resources: ReadonlyArray<string>) =>
    paths.some(path =>
      resources.some(
        resource =>
          containsPath(path, pathKey(resource)) ||
          containsPath(pathKey(resource), path)
      )
    )
  return (
    overlaps([...destructiveOperations.keys()]) ||
    [...mutationReservations].some(resources => overlaps([...resources])) ||
    [...new Set(repositories.values())].some(
      repository =>
        [...repository.operations].some(
          operation => operation.kind === 'mutation'
        ) &&
        overlaps(
          repositoryResourcePaths.get(pathKey(repository.path)) ?? [
            ...repository.aliases,
          ]
        )
    )
  )
}

/** Register ordinary mutation lifetimes without serializing existing ordinary concurrency. */
export async function withRepositoryGitResourceMutation<T>(
  paths: ReadonlyArray<string>,
  operation: () => Promise<T>
): Promise<T> {
  const resources = new Set(paths.map(pathKey))
  for (const path of resources) {
    assertRepositoryGitDestructionAvailable(path)
  }
  mutationReservations.add(resources)
  try {
    return await operation()
  } finally {
    mutationReservations.delete(resources)
  }
}

/** Register an ancestor removal for its entire lifetime so a later run cannot capture inside it. */
export async function withRepositoryGitDestruction<T>(
  path: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = pathKey(await canonicalMutationPath(path))
  const owned = destructiveContexts.getStore()
  const previous = owned?.get(key)
  if (previous !== undefined && destructiveOperations.get(key) === previous) {
    return operation()
  }
  assertRepositoryGitDestructionAvailable(key)
  if (destructiveOperations.has(key)) {
    throw new AssistedCommitError(
      'busy',
      'This directory is already being removed'
    )
  }

  const ownership = Object.freeze({})
  destructiveOperations.set(key, ownership)
  const owners = new Map(owned)
  owners.set(key, ownership)
  try {
    return await destructiveContexts.run(owners, operation)
  } finally {
    if (destructiveOperations.get(key) === ownership) {
      destructiveOperations.delete(key)
    }
  }
}

/** A not-yet-existing checkout target still belongs to its canonical existing parent. */
export async function canonicalMutationPath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error) {
    const parent = dirname(resolve(path))
    if (
      isErrnoException(error) &&
      error.code === 'ENOENT' &&
      parent !== resolve(path)
    ) {
      return resolve(await canonicalMutationPath(parent), basename(path))
    }
    throw error
  }
}

function parseAlternateObjectDirectory(value: string): string {
  if (!value.startsWith('"')) {
    return value
  }
  if (!value.endsWith('"')) {
    throw new Error('Git returned an unterminated alternate object directory')
  }
  const escapes: Readonly<Record<string, number>> = {
    a: 7,
    b: 8,
    f: 12,
    n: 10,
    r: 13,
    t: 9,
    v: 11,
    '"': 34,
    '\\': 92,
  }
  const parts = value.slice(1, -1).split(/(\\(?:[0-7]{3}|[abfnrtv"\\]))/)
  return Buffer.concat(
    parts.map(part => {
      if (!part.startsWith('\\')) {
        if (part.includes('\\')) {
          throw new Error('Git returned unsupported alternate path quoting')
        }
        return Buffer.from(part)
      }
      const escape = part.slice(1)
      const byte = /^[0-7]{3}$/.test(escape)
        ? parseInt(escape, 8)
        : escapes[escape]
      if (byte === undefined || byte > 255) {
        throw new Error('Git returned unsupported alternate path quoting')
      }
      return Buffer.from([byte])
    })
  ).toString('utf8')
}

/** Resolve working directory and both linked/common Git metadata without reading selected content. */
export async function getAssistedCommitProtectedPaths(
  path: string
): Promise<ReadonlyArray<string>> {
  return (await getAssistedCommitProtectedResources(path)).paths
}

/** Discover admitted paths and the complete native alternate-object routing graph together. */
export async function getAssistedCommitProtectedResources(
  path: string
): Promise<{
  readonly paths: ReadonlyArray<string>
  readonly objectDirectories: ReadonlyArray<string>
  readonly objectRoutingDiagnostics: string
}> {
  const directory = await git(
    ['rev-parse', '--absolute-git-dir'],
    path,
    'assistedCommitMetadataDirectory'
  )
  const common = await git(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    path,
    'assistedCommitCommonDirectory'
  )
  const objects = await git(
    ['rev-parse', '--path-format=absolute', '--git-path', 'objects'],
    path,
    'assistedCommitObjectDirectory'
  )
  // Git expands recursive alternates and its environment syntax. Do not try
  // to reconstruct this dependency graph from just objects/info/alternates.
  const alternates = await git(
    ['-c', 'core.quotePath=false', 'count-objects', '-v'],
    path,
    'assistedCommitAlternateObjectDirectories'
  )
  const objectDirectories = [
    objects.stdout.replace(/\r?\n$/, ''),
    ...alternates.stdout
      .split(/\r?\n/)
      .filter(line => line.startsWith('alternate: '))
      .map(line => parseAlternateObjectDirectory(line.slice(11))),
  ]
  const original = [
    path,
    directory.stdout.replace(/\r?\n$/, ''),
    common.stdout.replace(/\r?\n$/, ''),
    ...objectDirectories,
  ]
  const paths = [
    ...original,
    ...(await Promise.all(original.map(value => realpath(value)))),
  ]
  repositoryResourcePaths.set(pathKey(path), paths)
  repositoryResourcePaths.set(pathKey(paths[original.length]), paths)
  return {
    paths,
    objectDirectories,
    // Garbage warnings describe non-object entries, not omitted routing edges.
    objectRoutingDiagnostics: alternates.stderr
      .split(/\r?\n/)
      .filter(
        line => line.length > 0 && !line.startsWith('warning: garbage found: ')
      )
      .join('\n'),
  }
}

/** Observers and UI callbacks must never inherit transaction or draining-operation access. */
export function withoutRepositoryGitAccess<T>(operation: () => T): T {
  return destructiveContexts.exit(() => contexts.exit(operation))
}

/** Command-local read-only refresh; never changes process.env or Git configuration. */
export function getRepositoryGitReadEnvironment():
  | { readonly GIT_OPTIONAL_LOCKS: string }
  | undefined {
  return contexts.getStore()?.readOnly === true
    ? { GIT_OPTIONAL_LOCKS: '0' }
    : undefined
}

/** Additional certification never grants access beyond the current admitted operation. */
export function withRepositoryGitSpawnFence<T>(
  beforeSpawn: () => void,
  operation: () => T
): T {
  const current = contexts.getStore()
  if (current === undefined) {
    throw new Error('Git spawn certification requires an owned operation scope')
  }
  return contexts.run(
    {
      ...current,
      beforeSpawn: () => {
        current.beforeSpawn?.()
        beforeSpawn()
      },
    },
    operation
  )
}

/** Check scoped ownership immediately before native execution. */
export function verifyRepositoryGitSpawnFence(): void {
  contexts.getStore()?.beforeSpawn?.()
}

/** Required assisted reconciliation must never turn Git failures into undefined. */
export function getRepositoryGitErrorPropagation(): boolean {
  return contexts.getStore()?.propagateErrors === true
}

/** Scope strict error reporting and optional-lock-free reconciliation to an owned read. */
export function withRepositoryGitErrorPropagation<T>(operation: () => T): T {
  const current = contexts.getStore()
  if (current === undefined) {
    throw new Error(
      'Strict Git reconciliation requires an owned operation scope'
    )
  }
  return contexts.run(
    { ...current, readOnly: true, propagateErrors: true },
    operation
  )
}

/**
 * Track an entire existing operation, not just one of its Git subprocesses.
 *
 * A lease drains operations already admitted before capture. New readers wait
 * until release, while new mutations fail rather than silently running later.
 */
export async function withRepositoryGitOperation<T>(
  path: string,
  kind: 'read' | 'mutation',
  operation: () => Promise<T>,
  trackNested: boolean = false
): Promise<T> {
  verifyRepositoryGitSpawnFence()
  const repository = await repositoryOperations(path)
  verifyRepositoryGitSpawnFence()
  const admitted = hasAccess(repository)
  if (
    !admitted &&
    kind === 'mutation' &&
    (isRepositoryAffectedByAssistedCommit(path) ||
      isRepositoryAffectedByAssistedCommit(repository.path))
  ) {
    throw new AssistedCommitError(
      'busy',
      'An assisted commit run protects these working files or shared Git metadata'
    )
  }
  if (admitted && !trackNested) {
    return operation()
  }
  while (!admitted && repository.lease !== undefined) {
    if (kind === 'mutation') {
      throw new AssistedCommitError(
        'busy',
        'An assisted commit run owns this repository'
      )
    }
    repository.waiters++
    try {
      await repository.lease.released
    } finally {
      repository.waiters--
    }
  }
  const pending = pendingOperation(kind)
  repository.operations.add(pending)
  try {
    return await contexts.run(
      {
        repository,
        owner: pending,
        readOnly: contexts.getStore()?.readOnly,
        parent: contexts.getStore(),
        propagateErrors: contexts.getStore()?.propagateErrors,
        beforeSpawn: contexts.getStore()?.beforeSpawn,
      },
      operation
    )
  } finally {
    repository.operations.delete(pending)
    pending.complete()
    forget(repository)
  }
}

/** Additional metadata must not borrow another live operation's ownership. */
export function assertAssistedCommitGitResourceAdmission(
  path: string,
  protectedPaths: ReadonlyArray<string>
): void {
  const owner = lookup(path)
  const requestedPaths = repositoryResourcePaths.get(pathKey(path))
  const requestedOwner = pathKey(
    requestedPaths?.[requestedPaths.length / 2] ?? path
  )
  for (const protectedPath of protectedPaths) {
    const key = pathKey(protectedPath)
    if (
      [...resourceProtections].some(resources => {
        return (
          resourceProtectionOwners.get(resources)?.has(requestedOwner) !==
            true &&
          [...resources].some(
            resource =>
              containsPath(resource, key) || containsPath(key, resource)
          )
        )
      }) ||
      [...new Set(repositories.values())].some(
        repository =>
          repository !== owner &&
          repository.lease !== undefined &&
          [...repository.protectedPaths, ...repository.aliases].some(
            resource =>
              containsPath(resource, key) || containsPath(key, resource)
          )
      ) ||
      [...destructiveOperations.keys()].some(
        removing => containsPath(removing, key) || containsPath(key, removing)
      ) ||
      [...mutationReservations].some(resources =>
        [...resources].some(
          resource => containsPath(resource, key) || containsPath(key, resource)
        )
      )
    ) {
      throw new AssistedCommitError(
        'busy',
        'Another Git operation owns repository metadata needed for assisted push'
      )
    }
  }
}

/** Acquire before snapshot capture and release only after local completion or recovery. */
export async function acquireAssistedCommitGitLease(
  path: string,
  protectedPaths: ReadonlyArray<string> = [path],
  beforeSpawn?: () => void
): Promise<IAssistedCommitGitLease> {
  const repository = await repositoryOperations(path)
  if (repository.lease !== undefined) {
    throw new AssistedCommitError(
      'busy',
      'An assisted commit run already owns this repository'
    )
  }
  try {
    assertAssistedCommitGitResourceAdmission(path, protectedPaths)
  } catch (error) {
    forget(repository)
    throw error
  }
  for (const protectedPath of protectedPaths) {
    repository.protectedPaths.add(pathKey(protectedPath))
  }
  const pending = pendingOperation()
  const lease: IRepositoryLease = {
    released: pending.done,
    release: pending.complete,
  }
  repository.lease = lease
  while (repository.operations.size > 0) {
    await Promise.all(
      [...repository.operations].map(operation => operation.done)
    )
  }
  return {
    run: (operation, readOnly = false) => {
      if (repository.lease !== lease) {
        throw new AssistedCommitError(
          'disposed',
          'Assisted commit Git ownership was released'
        )
      }
      return contexts.run(
        { repository, owner: lease, readOnly, beforeSpawn },
        operation
      )
    },
    release: () => {
      if (repository.lease === lease) {
        repository.lease = undefined
        lease.release()
        forget(repository)
      }
    },
  }
}

function gitCommandIndex(args: ReadonlyArray<string>): number {
  let index = 0
  while (args[index]?.startsWith('-')) {
    const option = args[index++]
    if (
      option === '-c' ||
      option === '-C' ||
      option === '--git-dir' ||
      option === '--work-tree'
    ) {
      index++
    }
  }
  return index
}

function parseGitConfiguration(parameters: ReadonlyArray<string>) {
  const flags = new Set<string>()
  const positional: string[] = []
  let optionsEnded = false
  for (let index = 0; index < parameters.length; index++) {
    const value = parameters[index]
    if (optionsEnded) {
      positional.push(value)
    } else if (value === '--') {
      optionsEnded = true
    } else if (value.startsWith('-')) {
      flags.add(value)
      if (['--type', '--file', '-f', '--blob', '--default'].includes(value)) {
        index++
      }
    } else {
      positional.push(value)
    }
  }
  return { flags, positional }
}

function isReadOnlyGitConfiguration(
  configuration: ReturnType<typeof parseGitConfiguration>
): boolean {
  const { flags, positional } = configuration
  if (
    [
      '--add',
      '-a',
      '--replace-all',
      '--unset',
      '--unset-all',
      '--remove-section',
      '--rename-section',
      '--edit',
      '-e',
    ].some(flag => flags.has(flag))
  ) {
    return false
  }
  return (
    [
      '--get',
      '--get-all',
      '--get-regexp',
      '--get-urlmatch',
      '--list',
      '-l',
    ].some(flag => flags.has(flag)) || positional.length === 1
  )
}

/** Clone owns its destination; read-only global config has no worktree ownership. */
export function getRepositoryGitOperationPath(
  args: ReadonlyArray<string>,
  path: string
): string | undefined {
  const index = gitCommandIndex(args)
  if (args[index] === 'config') {
    const configuration = parseGitConfiguration(args.slice(index + 1))
    if (
      configuration.flags.has('--global') &&
      isReadOnlyGitConfiguration(configuration)
    ) {
      return undefined
    }
  }
  const boundary = args.length - 3
  return args[index] === 'clone' && boundary > index && args[boundary] === '--'
    ? resolve(path, args[boundary + 2])
    : path
}

/** Conservative command classification. Unknown commands never queue a mutation. */
export function isReadOnlyGitCommand(args: ReadonlyArray<string>): boolean {
  let index = gitCommandIndex(args)
  const command = args[index++]
  const parameters = args.slice(index)
  if (command === 'config') {
    return isReadOnlyGitConfiguration(parseGitConfiguration(parameters))
  }
  if (command === 'interpret-trailers') {
    return !parameters.includes('--in-place')
  }
  if (command === 'remote') {
    return (
      parameters.length === 0 ||
      (parameters.length === 1 && parameters[0] === '-v') ||
      parameters[0] === 'get-url'
    )
  }
  if (command === 'ls-remote') {
    return (
      parameters.length === 3 &&
      parameters[0] === '--get-url' &&
      parameters[1] === '--'
    )
  }
  if (command === 'symbolic-ref') {
    return (
      parameters.filter(parameter => !parameter.startsWith('-')).length === 1 &&
      !parameters.includes('--delete')
    )
  }
  if (command === 'worktree') {
    return parameters[0] === 'list'
  }
  return (
    command !== undefined &&
    [
      'status',
      'diff',
      'log',
      'show',
      'rev-parse',
      'for-each-ref',
      'ls-files',
      'ls-tree',
      'cat-file',
      'merge-base',
      'check-ignore',
      'check-attr',
      'check-ref-format',
      'describe',
      'name-rev',
      'rev-list',
      'var',
      'count-objects',
    ].includes(command)
  )
}
