import { randomUUID } from 'crypto'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  IAssistedCommitChange,
  IAssistedCommitSnapshot,
} from '../../../models/assisted-commit'
import { ICopilotAssistedCommitRequest } from '../../../models/copilot-assisted-commit'
import { Repository } from '../../../models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../../models/status'
import {
  DiffLine,
  DiffLineType,
  DiffSelection,
  DiffSelectionType,
  IRawDiff,
} from '../../../models/diff'
import { DiffParser } from '../../diff-parser'
import { git } from '../core'
import { AssistedCommitError, checkAssistedCommitCancellation } from './error'
import {
  ensureNoRepositoryOperation,
  fileTreeUpdates,
  gitPath,
  hashBlob,
  initializePrivateRepository,
  privateGit,
  readBlob,
  readHead,
  readIndexState,
  readSelectedFileState,
  readTreeEntry,
  removeGitLineEnding,
  splitByteLines,
  validateSelectedPath,
  verifyHead,
  verifyIndex,
  verifySelectedFiles,
  writeTree,
} from './git'
import {
  disposedSnapshots,
  IAssistedCommitData,
  IFrozenFile,
  ITreeEntry,
  snapshots,
} from './state'
import { IAssistedCommitOperationOptions } from './progress'

const MaximumSplittableBytes = 4 * 1024 * 1024
const ParsedDiffConfiguration: ReadonlyArray<string> = [
  '-c',
  'diff.suppressBlankEmpty=false',
]

function frozenInputFilterConfiguration(output: string): ReadonlyArray<string> {
  const options: string[] = []
  for (const field of output.split('\0').filter(field => field.length > 0)) {
    const delimiter = field.indexOf('\n')
    if (delimiter === -1) {
      throw new AssistedCommitError(
        'unsafe-selection',
        'Cannot freeze malformed Git filter configuration'
      )
    }
    const key = field.slice(0, delimiter)
    const command = field.slice(delimiter + 1)
    if (command.length > 0) {
      options.push(
        '-c',
        `${key}=(cd -- "$DESKTOP_ASSISTED_CAPTURE_ROOT" && export GIT_WORK_TREE="$DESKTOP_ASSISTED_CAPTURE_ROOT" && {\n${command}\n})`
      )
    }
  }
  return options
}

function cloneFile(
  file: WorkingDirectoryFileChange
): WorkingDirectoryFileChange {
  const status = Object.freeze({
    ...file.status,
    submoduleStatus:
      file.status.submoduleStatus === undefined
        ? undefined
        : Object.freeze({ ...file.status.submoduleStatus }),
  })
  return Object.freeze(
    new WorkingDirectoryFileChange(file.path, status, file.selection)
  )
}

function cloneRequest(
  request: ICopilotAssistedCommitRequest
): ICopilotAssistedCommitRequest {
  return Object.freeze({
    files: Object.freeze(
      request.files
        .filter(f => f.selection.getSelectionType() !== DiffSelectionType.None)
        .map(cloneFile)
    ),
    trailers: Object.freeze(request.trailers.map(t => Object.freeze({ ...t }))),
    skipCommitHooks: request.skipCommitHooks,
    signOffCommits: request.signOffCommits,
    allowEmptyCommit: request.allowEmptyCommit,
  })
}

function validateSelectionPaths(request: ICopilotAssistedCommitRequest): void {
  const paths = new Set<string>()
  for (const file of request.files) {
    validateSelectedPath(file.path)
    if (paths.has(file.path)) {
      throw new AssistedCommitError(
        'unsafe-selection',
        'Selected paths overlap'
      )
    }
    paths.add(file.path)
    if (
      file.status.kind === AppFileStatusKind.Renamed ||
      file.status.kind === AppFileStatusKind.Copied
    ) {
      validateSelectedPath(file.status.oldPath)
      if (file.status.oldPath === file.path) {
        throw new AssistedCommitError(
          'unsafe-selection',
          'A rename or copy cannot target itself'
        )
      }
    }
    if (
      file.status.kind === AppFileStatusKind.Conflicted ||
      file.status.submoduleStatus !== undefined
    ) {
      throw new AssistedCommitError(
        'unsafe-selection',
        'Conflicts and submodules cannot be included in assisted commits'
      )
    }
  }
  for (const file of request.files) {
    const oldPath =
      file.status.kind === AppFileStatusKind.Renamed
        ? file.status.oldPath
        : null
    if (
      oldPath !== null &&
      (paths.has(oldPath) ||
        request.files.some(
          other =>
            other !== file &&
            other.status.kind === AppFileStatusKind.Renamed &&
            other.status.oldPath === oldPath
        ))
    ) {
      throw new AssistedCommitError(
        'unsafe-selection',
        'Overlapping selected rename paths cannot be represented independently'
      )
    }
  }
}

function lineBytes(line: DiffLine): Buffer {
  return Buffer.from(
    `${line.text.slice(1)}${line.noTrailingNewLine ? '' : '\n'}`,
    'utf8'
  )
}

function selectedText(
  baseBytes: Buffer,
  diff: IRawDiff,
  selection: DiffSelection
): Buffer {
  const base = splitByteLines(baseBytes)
  const result: Buffer[] = []
  let cursor = 0
  let selectedLines = 0
  for (const hunk of diff.hunks) {
    const start =
      hunk.header.oldLineCount === 0
        ? hunk.header.oldStartLine
        : hunk.header.oldStartLine - 1
    if (start < cursor || start > base.length) {
      throw new AssistedCommitError(
        'unsafe-selection',
        'Frozen diff has overlapping or invalid hunks'
      )
    }
    result.push(Buffer.concat(base.slice(cursor, start)))
    cursor = start
    for (const [index, line] of hunk.lines.entries()) {
      if (line.type === DiffLineType.Hunk) {
        continue
      }
      const bytes = lineBytes(line)
      if (line.type !== DiffLineType.Add) {
        if (base[cursor] === undefined || !base[cursor].equals(bytes)) {
          throw new AssistedCommitError(
            'unsafe-selection',
            'Frozen diff does not match its base bytes'
          )
        }
        cursor++
      }
      const selected = selection.isSelected(hunk.unifiedDiffStart + index)
      if (
        line.type === DiffLineType.Context ||
        (line.type === DiffLineType.Delete && !selected)
      ) {
        result.push(bytes)
      } else if (line.type === DiffLineType.Add && selected) {
        result.push(bytes)
      }
      if (line.type !== DiffLineType.Context && selected) {
        selectedLines++
      }
    }
    if (cursor !== start + hunk.header.oldLineCount) {
      throw new AssistedCommitError(
        'unsafe-selection',
        'Frozen diff has an inconsistent line count'
      )
    }
  }
  if (selectedLines === 0) {
    throw new AssistedCommitError(
      'unsafe-selection',
      'A partial selection contains no changed lines'
    )
  }
  result.push(Buffer.concat(base.slice(cursor)))
  return Buffer.concat(result)
}

async function frozenDiff(
  data: Parameters<typeof privateGit>[0],
  base: string,
  tree: string,
  paths: ReadonlyArray<string>,
  parseText: boolean = true
): Promise<{ readonly text: string; readonly parsed: IRawDiff | null }> {
  const result = await privateGit(
    data,
    [
      ...ParsedDiffConfiguration,
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-renames',
      '--no-color',
      '--patch',
      '--end-of-options',
      base,
      tree,
      '--',
      ...paths,
    ],
    'assistedCommitFrozenDiff',
    { encoding: 'buffer' }
  )
  const text = result.stdout.toString('utf8')
  const parsed =
    parseText &&
    paths.length === 1 &&
    Buffer.from(text, 'utf8').equals(result.stdout)
      ? new DiffParser().parse(text)
      : null
  return { text, parsed }
}

async function ensurePartialDiffIsUntransformed(
  data: Parameters<typeof privateGit>[0],
  path: string
): Promise<void> {
  const attributes = await privateGit(
    data,
    ['check-attr', '-z', '--stdin', 'diff'],
    'assistedCommitCheckDiffDriver',
    { stdin: `${path}\0` }
  )
  const attribute = attributes.stdout.split('\0')[2]
  if (
    attribute !== undefined &&
    ['set', 'unset', 'unspecified'].includes(attribute)
  ) {
    const literal = await privateGit(
      data,
      ['config', '--get', `diff.${attribute}.textconv`],
      'assistedCommitCheckAmbiguousTextconvDriver',
      { successExitCodes: new Set([0, 1]) }
    )
    if (literal.exitCode === 0) {
      throw new AssistedCommitError(
        'unsafe-selection',
        'Ambiguous sentinel-named textconv partial selection cannot be mapped safely'
      )
    }
  }
  const driver =
    attribute === undefined ||
    attribute === 'unspecified' ||
    attribute === 'set'
      ? 'default'
      : attribute
  {
    const textconv = await privateGit(
      data,
      ['config', '--get', `diff.${driver}.textconv`],
      'assistedCommitCheckTextconv',
      { successExitCodes: new Set([0, 1]) }
    )
    if (textconv.exitCode === 0) {
      throw new AssistedCommitError(
        'unsafe-selection',
        'Partial selections from text-converted diffs are not supported'
      )
    }
    if (driver !== 'default') {
      const fallback = await privateGit(
        data,
        ['config', '--get', 'diff.default.textconv'],
        'assistedCommitCheckDefaultTextconvFallback',
        { successExitCodes: new Set([0, 1]) }
      )
      if (fallback.exitCode === 0) {
        throw new AssistedCommitError(
          'unsafe-selection',
          'Partial diff-driver fallback cannot be safely mapped with default textconv'
        )
      }
    }
  }
}

/**
 * Capture selected bytes and line choices without changing the real index.
 *
 * HEAD, index bytes, selected paths/types/modes/bytes are checked again after
 * capture. An unselected recreated rename source is deliberately not watched.
 */
export async function captureAssistedCommitSnapshot(
  repository: Repository,
  input: ICopilotAssistedCommitRequest,
  options: IAssistedCommitOperationOptions = {}
): Promise<IAssistedCommitSnapshot> {
  const incomingAttributeSource = process.env.GIT_ATTR_SOURCE
  checkAssistedCommitCancellation(options.signal)
  const request = cloneRequest(input)
  validateSelectionPaths(request)
  if (request.files.length === 0 && !request.allowEmptyCommit) {
    throw new AssistedCommitError('unsafe-selection', 'No changes are selected')
  }
  await options.onProgress?.({ kind: 'capturing' })
  checkAssistedCommitCancellation(options.signal)
  const root = await realpath(repository.path)
  const top = await git(
    ['rev-parse', '--show-toplevel'],
    repository.path,
    'assistedCommitRoot'
  )
  if ((await realpath(removeGitLineEnding(top.stdout))) !== root) {
    throw new AssistedCommitError(
      'unsafe-selection',
      'Assisted commits require the repository root'
    )
  }
  await ensureNoRepositoryOperation(repository)
  const format = await git(
    ['rev-parse', '--show-ref-format'],
    repository.path,
    'assistedCommitRefFormat'
  )
  if (removeGitLineEnding(format.stdout) !== 'files') {
    throw new AssistedCommitError(
      'unsafe-selection',
      'Assisted commits currently require file-backed Git refs'
    )
  }
  const head = await readHead(repository)
  const gitDirectory = await realpath(
    removeGitLineEnding(
      (
        await git(
          ['rev-parse', '--absolute-git-dir'],
          repository.path,
          'assistedCommitDirectory'
        )
      ).stdout
    )
  )
  const headBytes = await readFile(join(gitDirectory, 'HEAD'))
  const indexPath = await gitPath(repository, 'index')
  const originalIndex = await readIndexState(indexPath)
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'desktop-assisted-commit-')
  )
  try {
    const privateIndex = join(temporaryDirectory, 'index')
    const environment = await initializePrivateRepository(
      repository,
      root,
      temporaryDirectory,
      headBytes,
      privateIndex
    )
    const context = { repository, environment, temporaryDirectory }
    const originalEntries = await git(
      ['ls-files', '--stage', '-z'],
      repository.path,
      'assistedCommitCaptureAttributesIndex'
    )
    const noIndexHooks = [
      '-c',
      `core.hooksPath=${join(temporaryDirectory, 'no-hooks')}`,
    ]
    await privateGit(
      context,
      [...noIndexHooks, 'read-tree', '--empty'],
      'assistedCommitInitializeAttributesIndex'
    )
    if (originalEntries.stdout.length > 0) {
      await privateGit(
        context,
        [...noIndexHooks, 'update-index', '-z', '--index-info'],
        'assistedCommitPopulateAttributesIndex',
        { stdin: originalEntries.stdout }
      )
    }
    const indexedAttributesTree = removeGitLineEnding(
      (
        await privateGit(
          context,
          [...noIndexHooks, 'write-tree'],
          'assistedCommitIndexedAttributesTree'
        )
      ).stdout
    )
    if (
      incomingAttributeSource !== undefined &&
      incomingAttributeSource.length > 0
    ) {
      environment.GIT_ATTR_SOURCE = removeGitLineEnding(
        (
          await privateGit(
            context,
            [
              'rev-parse',
              '--verify',
              '--end-of-options',
              `${incomingAttributeSource}^{tree}`,
            ],
            'assistedCommitFreezeInheritedAttributes'
          )
        ).stdout
      )
    } else {
      const attributePaths = new Set<string>()
      for (const file of request.files) {
        const parents = file.path.split('/').slice(0, -1)
        attributePaths.add('.gitattributes')
        for (let length = 1; length <= parents.length; length++) {
          attributePaths.add(
            `${parents.slice(0, length).join('/')}/.gitattributes`
          )
        }
      }
      const attributeEntries = []
      for (const path of attributePaths) {
        const state = await readSelectedFileState(root, path)
        if (state.kind === 'file') {
          attributeEntries.push({
            path,
            entry: {
              path,
              mode: '100644',
              sha: await hashBlob(context, state.bytes),
            },
          })
        } else if (state.kind !== 'missing') {
          throw new AssistedCommitError(
            'unsafe-selection',
            'Non-regular attribute sources cannot be frozen safely'
          )
        }
      }
      environment.GIT_ATTR_SOURCE = await writeTree(
        context,
        indexedAttributesTree,
        attributeEntries,
        join(temporaryDirectory, 'attributes-index')
      )
    }
    const baseTree = removeGitLineEnding(
      head.sha === null
        ? (
            await privateGit(context, ['mktree'], 'assistedCommitEmptyTree', {
              stdin: '',
            })
          ).stdout
        : (
            await privateGit(
              context,
              ['rev-parse', `${head.sha}^{tree}`],
              'assistedCommitBaseTree'
            )
          ).stdout
    )
    const files: IFrozenFile[] = []
    const changes: IAssistedCommitChange[] = []
    const scratchIndex = join(temporaryDirectory, 'capture-index')
    const fileMode = await privateGit(
      context,
      ['config', '--bool', '--get', 'core.filemode'],
      'assistedCommitFileMode',
      { successExitCodes: new Set([0, 1]) }
    )
    const trackExecutable =
      fileMode.exitCode !== 0 ||
      removeGitLineEnding(fileMode.stdout) !== 'false'
    const symlinks = await privateGit(
      context,
      ['config', '--bool', '--get', 'core.symlinks'],
      'assistedCommitSymlinks',
      { successExitCodes: new Set([0, 1]) }
    )
    const symlinkPlaceholders =
      symlinks.exitCode === 0 &&
      removeGitLineEnding(symlinks.stdout) === 'false'
    const filterCommands = await privateGit(
      context,
      ['config', '--null', '--get-regexp', '^filter\\..*\\.(clean|process)$'],
      'assistedCommitFreezeCaptureFilters',
      { successExitCodes: new Set([0, 1]) }
    )
    const filterConfiguration = frozenInputFilterConfiguration(
      filterCommands.stdout
    )
    const captureWorkingTree = join(temporaryDirectory, 'capture-worktree')
    await mkdir(captureWorkingTree)
    const capturedFiles = []
    for (const file of request.files) {
      checkAssistedCommitCancellation(options.signal)
      capturedFiles.push({
        file,
        state: await readSelectedFileState(root, file.path),
      })
    }
    for (const { file, state } of capturedFiles) {
      checkAssistedCommitCancellation(options.signal)
      const renamed = file.status.kind === AppFileStatusKind.Renamed
      const copied = file.status.kind === AppFileStatusKind.Copied
      const base = await readTreeEntry(
        context,
        baseTree,
        renamed ? file.status.oldPath : file.path
      )
      const blockingDeletions = request.files
        .filter(
          other =>
            other.status.kind === AppFileStatusKind.Deleted &&
            file.path.startsWith(`${other.path}/`)
        )
        .map(other => ({ path: other.path, entry: null }))
      if (
        renamed &&
        (base === null ||
          (await readTreeEntry(context, baseTree, file.path)) !== null)
      ) {
        throw new AssistedCommitError(
          'unsafe-selection',
          'A selected rename has an invalid original or destination path'
        )
      }
      if (
        copied &&
        (await readTreeEntry(context, baseTree, file.status.oldPath)) === null
      ) {
        throw new AssistedCommitError(
          'unsafe-selection',
          'A selected copy has no original HEAD path'
        )
      }
      const baseBytes = await readBlob(context, base)
      const partial =
        file.selection.getSelectionType() === DiffSelectionType.Partial
      if (
        partial &&
        base !== null &&
        (file.status.kind === AppFileStatusKind.New ||
          file.status.kind === AppFileStatusKind.Untracked)
      ) {
        throw new AssistedCommitError(
          'unsafe-selection',
          'Addition-only partial selection no longer matches its original displayed basis'
        )
      }
      if (partial && (renamed || copied || base?.mode === '120000')) {
        throw new AssistedCommitError(
          'unsafe-selection',
          'Partial rename, copy, or symlink selections are not supported'
        )
      }
      const deleted = file.status.kind === AppFileStatusKind.Deleted
      if (!deleted && !('bytes' in state)) {
        throw new AssistedCommitError(
          'unsafe-selection',
          `Selected file is missing or is a directory: ${JSON.stringify(
            file.path
          )}`
        )
      }
      const symlink =
        state.kind === 'symlink' ||
        (symlinkPlaceholders &&
          state.kind === 'file' &&
          base?.mode === '120000')
      const mode = symlink
        ? '120000'
        : !trackExecutable
        ? base !== null && base.mode !== '120000'
          ? base.mode
          : '100644'
        : (state.mode & 0o100) !== 0
        ? '100755'
        : '100644'
      let full: ITreeEntry | null = deleted
        ? null
        : {
            path: file.path,
            mode,
            sha: await hashBlob(
              context,
              'bytes' in state ? state.bytes : Buffer.alloc(0),
              symlink ? undefined : file.path
            ),
          }
      if (
        !partial &&
        !deleted &&
        !renamed &&
        !copied &&
        state.kind === 'file' &&
        base !== null &&
        base.mode !== '120000'
      ) {
        const capturedPath = join(captureWorkingTree, file.path)
        await mkdir(dirname(capturedPath), { recursive: true })
        await writeFile(capturedPath, state.bytes)
        await chmod(capturedPath, mode === '100755' ? 0o555 : 0o444)
        const nativeIndex = join(temporaryDirectory, 'native-full-index')
        const env = { GIT_INDEX_FILE: nativeIndex }
        await privateGit(
          context,
          [...noIndexHooks, 'read-tree', baseTree],
          'assistedCommitNativeFullBase',
          { env }
        )
        const native = await privateGit(
          context,
          [
            ...filterConfiguration,
            '-c',
            'diff.noprefix=false',
            '-c',
            'diff.mnemonicPrefix=false',
            'diff',
            '--src-prefix=a/',
            '--dst-prefix=b/',
            '--binary',
            '--full-index',
            '--no-ext-diff',
            '--no-textconv',
            '--no-renames',
            '--no-color',
            '--patch',
            '--unified=3',
            '-O',
            '/dev/null',
            '--end-of-options',
            head.sha ?? baseTree,
            '--',
            file.path,
          ],
          'assistedCommitCaptureNativeFullConversion',
          {
            encoding: 'buffer',
            env: {
              ...env,
              GIT_OPTIONAL_LOCKS: '0',
              GIT_WORK_TREE: captureWorkingTree,
              DESKTOP_ASSISTED_CAPTURE_ROOT: root,
              GIT_DIFF_OPTS: '--unified=3',
            },
          }
        )
        if (native.stdout.length > 0) {
          await privateGit(
            context,
            [
              ...noIndexHooks,
              'apply',
              '--cached',
              '--binary',
              '--whitespace=nowarn',
              '-',
            ],
            'assistedCommitApplyFrozenNativeFull',
            { env, stdin: native.stdout }
          )
        }
        const nativeTree = removeGitLineEnding(
          (
            await privateGit(
              context,
              [...noIndexHooks, 'write-tree'],
              'assistedCommitNativeFullTree',
              { env }
            )
          ).stdout
        )
        const nativeEntry = await readTreeEntry(context, nativeTree, file.path)
        if (
          nativeEntry === null ||
          !['100644', '100755'].includes(nativeEntry.mode)
        ) {
          throw new AssistedCommitError(
            'unsafe-selection',
            'Native conversion did not preserve the selected regular file'
          )
        }
        full = { path: file.path, mode, sha: nativeEntry.sha }
      }
      const fullBytes = await readBlob(context, full)
      const fullTree = await writeTree(
        context,
        baseTree,
        [...blockingDeletions, ...fileTreeUpdates({ file, selected: full })],
        scratchIndex
      )
      const paths =
        renamed || copied ? [file.path, file.status.oldPath] : [file.path]
      const large = baseBytes.length + fullBytes.length > MaximumSplittableBytes
      const utf8 = [baseBytes, fullBytes].every(
        b => !b.includes(0) && Buffer.from(b.toString('utf8'), 'utf8').equals(b)
      )
      const diff = large
        ? {
            text: `Selected content change: ${JSON.stringify(
              file.path
            )} (too large for hunk splitting)\n`,
            parsed: null,
          }
        : await frozenDiff(
            context,
            baseTree,
            fullTree,
            paths,
            base?.mode !== '120000' && full?.mode !== '120000'
          )
      const text = utf8 && diff.parsed !== null && !diff.parsed.isBinary
      const modeChange =
        base !== null && full !== null && base.mode !== full.mode
      if (partial && (!text || modeChange || state.kind === 'symlink')) {
        throw new AssistedCommitError(
          'unsafe-selection',
          'Partial binary, large, or mode-changing selections are not supported'
        )
      }
      if (partial) {
        await ensurePartialDiffIsUntransformed(context, file.path)
        const nativeArgs =
          base === null
            ? [
                'diff',
                '--no-index',
                '--no-ext-diff',
                '--no-textconv',
                '--no-color',
                '--patch',
                '--',
                '/dev/null',
                file.path,
              ]
            : [
                'diff',
                '--no-ext-diff',
                '--no-textconv',
                '--no-renames',
                '--no-color',
                '--patch',
                '--end-of-options',
                head.sha ?? baseTree,
                '--',
                file.path,
              ]
        const native = await privateGit(
          context,
          [...ParsedDiffConfiguration, ...nativeArgs],
          'assistedCommitCertifyPartialDiff',
          {
            encoding: 'buffer',
            successExitCodes: new Set([0, 1]),
            env: {
              GIT_OPTIONAL_LOCKS: '0',
            },
          }
        )
        const nativeText = native.stdout.toString('utf8')
        if (
          !Buffer.from(nativeText, 'utf8').equals(native.stdout) ||
          diff.parsed === null
        ) {
          throw new AssistedCommitError(
            'unsafe-selection',
            'Partial diff identity cannot be certified'
          )
        }
        const originalDiff = new DiffParser().parse(nativeText)
        const signature = (value: IRawDiff) =>
          JSON.stringify(
            value.hunks.map(hunk => ({
              start: hunk.unifiedDiffStart,
              oldStart: hunk.header.oldStartLine,
              oldCount: hunk.header.oldLineCount,
              newStart: hunk.header.newStartLine,
              newCount: hunk.header.newLineCount,
              lines: hunk.lines.map(line => [
                line.type,
                line.type === DiffLineType.Hunk ? '' : line.text,
                line.noTrailingNewLine,
              ]),
            }))
          )
        if (
          originalDiff.isBinary ||
          signature(originalDiff) !== signature(diff.parsed)
        ) {
          throw new AssistedCommitError(
            'unsafe-selection',
            'Index-aware conversion changes partial diff identity; select the complete file or refresh selection'
          )
        }
      }
      const selectedBytes =
        partial && diff.parsed !== null
          ? selectedText(baseBytes, diff.parsed, file.selection)
          : fullBytes
      const selected: ITreeEntry | null = partial
        ? {
            path: file.path,
            mode: base?.mode ?? mode,
            sha: await hashBlob(context, selectedBytes),
          }
        : full
      const selectedTree = await writeTree(
        context,
        baseTree,
        [...blockingDeletions, ...fileTreeUpdates({ file, selected })],
        scratchIndex
      )
      if (selectedTree === baseTree) {
        throw new AssistedCommitError(
          'unsafe-selection',
          `Selected file has no commit delta: ${JSON.stringify(file.path)}`
        )
      }
      const selectedDiff = partial
        ? await frozenDiff(context, baseTree, selectedTree, paths)
        : diff
      const atomic =
        renamed ||
        copied ||
        (deleted && !partial) ||
        modeChange ||
        base?.mode === '120000' ||
        selected?.mode === '120000' ||
        !text ||
        (selectedDiff.parsed?.hunks.length ?? 0) === 0
      const atomicId = atomic ? randomUUID() : null
      const hunks =
        atomic || selectedDiff.parsed === null
          ? []
          : selectedDiff.parsed.hunks.map(hunk => {
              const id = randomUUID()
              const start =
                hunk.header.oldLineCount === 0
                  ? hunk.header.oldStartLine
                  : hunk.header.oldStartLine - 1
              const replacement = Buffer.concat(
                hunk.lines
                  .filter(
                    line =>
                      line.type === DiffLineType.Context ||
                      line.type === DiffLineType.Add
                  )
                  .map(lineBytes)
              )
              const hunkText = hunk.lines
                .map(
                  line =>
                    `${line.text}\n${
                      line.noTrailingNewLine
                        ? '\\ No newline at end of file\n'
                        : ''
                    }`
                )
                .join('')
              changes.push(
                Object.freeze({
                  id,
                  kind: 'text-hunk',
                  path: file.path,
                  diff: `${selectedDiff.parsed?.header ?? ''}\n${hunkText}`,
                })
              )
              return {
                id,
                start,
                end: start + hunk.header.oldLineCount,
                replacement,
              }
            })
      if (atomicId !== null) {
        changes.push(
          Object.freeze({
            id: atomicId,
            kind: 'atomic',
            path: file.path,
            ...(renamed || copied ? { oldPath: file.status.oldPath } : {}),
            diff: selectedDiff.text,
          })
        )
      }
      files.push({ file, state, base, selected, baseBytes, atomicId, hunks })
    }
    const selectedTree = await writeTree(
      context,
      baseTree,
      files.flatMap(fileTreeUpdates),
      scratchIndex
    )
    const id = randomUUID()
    const snapshot: IAssistedCommitSnapshot = Object.freeze({
      id,
      repositoryId: repository.id,
      repositoryPath: root,
      originalHead: head,
      selectedTree,
      analysis: Object.freeze({
        snapshotId: id,
        changes: Object.freeze(changes),
      }),
      originalSelection: request.files,
    })
    const data: IAssistedCommitData = {
      repository,
      snapshot,
      request,
      gitDirectory,
      indexPath,
      originalIndex,
      originalHeadBytes: headBytes,
      temporaryDirectory,
      environment,
      baseTree,
      zeroId: '0'.repeat(baseTree.length),
      files,
      phase: 'captured',
    }
    await verifyHead(data, head.sha)
    await verifyIndex(data)
    await verifySelectedFiles(data)
    await ensureNoRepositoryOperation(repository)
    checkAssistedCommitCancellation(options.signal)
    snapshots.set(snapshot, data)
    return snapshot
  } catch (error) {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true })
    } catch (cleanup) {
      throw new AssistedCommitError(
        'cleanup-failed',
        'Snapshot capture and temporary resource cleanup failed',
        { cause: new AggregateError([error, cleanup]) }
      )
    }
    throw error
  }
}

/** Dispose a snapshot's private metadata and indices. Safe to call twice. */
export async function disposeAssistedCommitSnapshot(
  snapshot: IAssistedCommitSnapshot
): Promise<void> {
  const data = snapshots.get(snapshot)
  if (data === undefined) {
    if (disposedSnapshots.has(snapshot)) {
      return
    }
    throw new AssistedCommitError(
      'disposed',
      'Snapshot was not captured by Desktop'
    )
  }
  if (data.phase !== 'captured') {
    throw new AssistedCommitError(
      'busy',
      'Cannot dispose an active assisted commit snapshot'
    )
  }
  data.phase = 'disposing'
  try {
    await rm(data.temporaryDirectory, { recursive: true, force: true })
  } catch (error) {
    data.phase = 'captured'
    throw new AssistedCommitError(
      'cleanup-failed',
      'Could not remove private assisted commit metadata',
      { cause: error }
    )
  }
  snapshots.delete(snapshot)
  disposedSnapshots.add(snapshot)
}

/**
 * Scope capture, planner work, validation, and execution to owned resources.
 *
 * Planner exceptions and cancellation before execution also dispose the snapshot.
 */
export async function withAssistedCommitSnapshot<T>(
  repository: Repository,
  request: ICopilotAssistedCommitRequest,
  operation: (snapshot: IAssistedCommitSnapshot) => Promise<T>,
  options: IAssistedCommitOperationOptions = {}
): Promise<T> {
  const snapshot = await captureAssistedCommitSnapshot(
    repository,
    request,
    options
  )
  let operationError: unknown
  try {
    return await operation(snapshot)
  } catch (error) {
    operationError = error
    throw error
  } finally {
    try {
      await disposeAssistedCommitSnapshot(snapshot)
    } catch (cleanup) {
      const recovery =
        operationError instanceof AssistedCommitError
          ? operationError.recovery
          : undefined
      throw new AssistedCommitError(
        recovery === undefined ? 'cleanup-failed' : 'recovery-failed',
        'Could not dispose the assisted commit snapshot',
        {
          cause:
            operationError === undefined
              ? cleanup
              : new AggregateError([operationError, cleanup]),
          ...(recovery === undefined
            ? {}
            : {
                recovery: Object.freeze({
                  ...recovery,
                  errors: Object.freeze([...recovery.errors, cleanup]),
                }),
              }),
        }
      )
    }
  }
}
