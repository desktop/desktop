import { CopilotClient, RuntimeConnection } from '@github/copilot-sdk'
import { createHash } from 'crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  ICopilotEvaluationRequest,
  ICopilotEvaluationResult,
  ICopilotEvaluationTurn,
} from '../../../script/copilot-eval/protocol'
import { EvaluationRequestError } from '../../../script/copilot-eval/parse-request'
import { IAssistedCommitAnalysis } from '../models/assisted-commit'
import { Repository } from '../models/repository'
import { AppFileStatusKind, WorkingDirectoryFileChange } from '../models/status'
import { DiffSelection, DiffSelectionType, DiffType } from '../models/diff'
import { planAssistedCommits } from './assisted-commit-planning'
import {
  AssistedCommitPlanningMode,
  CopilotAssistedCommitResponse,
  getAssistedCommitClientEnvironment,
} from './copilot-assisted-commit'
import { runAssistedCommitPlanningRequest } from './copilot-assisted-commit-request'
import { getCopilotInMemorySessionFsConfig } from './copilot-in-memory-session-fs-provider'
import {
  awaitCancellableCopilotOperation,
  CopilotResponseEvent,
  getCopilotPlanningClient,
  ICopilotPlanningClient,
  ICopilotPlanningSession,
} from './copilot-operation'
import { git } from './git/core'
import { withLocalGitEnvironment } from './git/execution-environment'
import { getWorkingDirectoryDiff } from './git/diff'
import { withAssistedCommitSnapshot } from './git/assisted-commit/snapshot'

function explicitToken(): string {
  const token =
    process.env.COPILOT_GITHUB_TOKEN ??
    process.env.GH_TOKEN ??
    process.env.GITHUB_TOKEN
  if (!token) {
    throw new EvaluationRequestError(
      'Live evaluation requires COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN'
    )
  }
  return token
}

function createLiveClient(repositoryPath: string, home: string): CopilotClient {
  return new CopilotClient({
    connection: RuntimeConnection.forStdio(),
    workingDirectory: repositoryPath,
    baseDirectory: join(home, '.copilot'),
    env: {
      ...getAssistedCommitClientEnvironment({
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        HOMEDRIVE: undefined,
        HOMEPATH: undefined,
        COPILOT_HOME: join(home, '.copilot'),
        XDG_CONFIG_HOME: join(home, '.config'),
      }),
      GITHUB_COPILOT_INTEGRATION_ID: 'copilot-desktop',
    },
    gitHubToken: explicitToken(),
    useLoggedInUser: false,
    logLevel: 'none',
    sessionFs: getCopilotInMemorySessionFsConfig(
      repositoryPath,
      __WIN32__ ? 'windows' : 'posix'
    ),
  })
}

/** List models with explicit credentials and an isolated, owned SDK runtime. */
export async function listCopilotEvaluationModels(): Promise<
  ReadonlyArray<string>
> {
  explicitToken()
  const root = await mkdtemp(join(tmpdir(), 'desktop-eval-models-'))
  const client = createLiveClient(root, root)
  try {
    return await awaitCancellableCopilotOperation(
      async () => {
        await client.start()
        return (await client.listModels()).map(model => model.id)
      },
      {
        signal: AbortSignal.timeout(60000),
        cancellationError: () => new Error('Model preflight timed out'),
      }
    )
  } finally {
    try {
      await client.forceStop()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
}

function fixtureContent(
  request: ICopilotEvaluationRequest,
  analysis: IAssistedCommitAnalysis,
  index: number
): string {
  if (request.transport.kind !== 'fixture') {
    throw new EvaluationRequestError('Expected an offline fixture transport')
  }
  const response = request.transport.responses[index]
  if (response === undefined) {
    throw new EvaluationRequestError(
      `No scripted response for planning turn ${index + 1}`
    )
  }
  if (response.type === 'raw') {
    return response.content
  }
  if (response.type === 'plan') {
    return JSON.stringify({
      result: {
        kind: 'plan',
        snapshotId: analysis.snapshotId,
        commits: response.groups.map(group => ({
          title: group.title,
          description: group.description ?? '',
          changeIds: analysis.changes
            .filter(
              change =>
                group.paths === undefined || group.paths.includes(change.path)
            )
            .map(change => change.id),
        })),
      },
    })
  }
  return JSON.stringify({
    result: {
      kind: response.type,
      snapshotId: analysis.snapshotId,
      title: response.title,
      description: response.description ?? '',
    },
  })
}

function fixtureClient(content: () => string): ICopilotPlanningClient {
  const events = new Set<(event: CopilotResponseEvent) => void>()
  return {
    createSession: async () => ({
      onSessionError: () => () => {},
      onResponseEvent: handler => {
        events.add(handler)
        return () => events.delete(handler)
      },
      send: async () => {
        const event: CopilotResponseEvent = {
          type: 'assistant.message',
          id: 'fixture-message',
          parentId: null,
          timestamp: new Date().toISOString(),
          data: {
            messageId: 'fixture-message',
            originatingMessageId: 'fixture-request',
            content: content(),
          },
        }
        events.forEach(handler => handler(event))
        events.forEach(handler =>
          handler({
            type: 'session.idle',
            id: 'fixture-idle',
            parentId: null,
            timestamp: new Date().toISOString(),
            ephemeral: true,
            data: {},
          })
        )
        return 'fixture-request'
      },
      sendAndWait: async () => {
        throw new Error('The production planner must use owned send/events')
      },
      disconnect: async () => {
        events.clear()
      },
    }),
    stop: async () => [],
    forceStop: async () => {
      events.clear()
    },
  }
}

function observeClient(
  client: ICopilotPlanningClient,
  mode: AssistedCommitPlanningMode,
  model: string,
  turns: ICopilotEvaluationTurn[]
): ICopilotPlanningClient {
  return {
    ...client,
    createSession: async config => {
      const session = await client.createSession(config)
      let started = performance.now()
      let index: number | undefined
      const update = () => {
        if (index !== undefined) {
          turns[index] = {
            ...turns[index],
            durationMs: performance.now() - started,
          }
        }
      }
      const observed: ICopilotPlanningSession = {
        ...session,
        send: options => {
          started = performance.now()
          index = turns.length
          turns.push({
            mode,
            model,
            systemPrompt:
              config.systemMessage?.mode === 'append'
                ? config.systemMessage.content ?? ''
                : '',
            userPrompt: options.prompt,
            responseSchema:
              options.responseSchema === undefined
                ? undefined
                : typeof options.responseSchema.toJSONSchema === 'function'
                ? options.responseSchema.toJSONSchema()
                : options.responseSchema,
            content: null,
            durationMs: 0,
          })
          return session.send(options)
        },
        disconnect: async () => {
          try {
            await session.disconnect()
          } finally {
            update()
          }
        },
      }
      return observed
    },
  }
}

async function writeFiles(
  root: string,
  files: Readonly<Record<string, string | null>>
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    if (content === null) {
      await rm(target)
    } else {
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, 'utf8')
    }
  }
}

async function worktreeDigest(root: string): Promise<string> {
  const hash = createHash('sha256')
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(join(root, directory), {
      withFileTypes: true,
    })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (directory === '' && entry.name === '.git') {
        continue
      }
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        hash.update(JSON.stringify(['directory', path]))
        await visit(path)
      } else if (entry.isFile()) {
        const content = await readFile(join(root, path))
        hash.update(JSON.stringify(['file', path, content.length]))
        hash.update(content)
      } else {
        throw new EvaluationRequestError(
          'Fixture worktrees may contain only files and directories'
        )
      }
    }
  }
  await visit('')
  return hash.digest('hex')
}

async function fixtureSelection(
  repository: Repository,
  request: ICopilotEvaluationRequest
): Promise<ReadonlyArray<WorkingDirectoryFileChange>> {
  if (request.input.kind !== 'repository') {
    throw new EvaluationRequestError('Expected a repository fixture')
  }
  const input = request.input
  return Promise.all(
    input.selection.map(async selected => {
      if (!Object.hasOwn(input.files, selected.path)) {
        throw new EvaluationRequestError(
          `Selected path has no fixture change: ${selected.path}`
        )
      }
      const status =
        input.files[selected.path] === null
          ? AppFileStatusKind.Deleted
          : Object.hasOwn(input.baseFiles, selected.path)
          ? AppFileStatusKind.Modified
          : AppFileStatusKind.Untracked
      const file = new WorkingDirectoryFileChange(
        selected.path,
        { kind: status },
        DiffSelection.fromInitialSelection(DiffSelectionType.All)
      )
      if (selected.hunks === undefined) {
        return file
      }
      if (new Set(selected.hunks).size !== selected.hunks.length) {
        throw new EvaluationRequestError('Duplicate selected hunk index')
      }
      const diff = await getWorkingDirectoryDiff(repository, file)
      if (diff.kind !== DiffType.Text) {
        throw new EvaluationRequestError(
          'Partial selections require a text diff'
        )
      }
      let selection = DiffSelection.fromInitialSelection(DiffSelectionType.None)
      for (const index of selected.hunks) {
        const hunk = diff.hunks[index]
        if (hunk === undefined) {
          throw new EvaluationRequestError('Selected hunk does not exist')
        }
        selection = selection.withRangeSelection(
          hunk.unifiedDiffStart,
          hunk.lines.length,
          true
        )
      }
      return file.withSelection(selection)
    })
  )
}

/** Run a benchmark through production code without accessing a user's repository or account store. */
export async function runCopilotEvaluation(
  request: ICopilotEvaluationRequest,
  signal?: AbortSignal
): Promise<ICopilotEvaluationResult> {
  const started = performance.now()
  const turns: ICopilotEvaluationTurn[] = []
  let analysis: IAssistedCommitAnalysis | undefined
  let response: CopilotAssistedCommitResponse | undefined
  let validation: ICopilotEvaluationResult['validation']
  let failed = false
  let failure: unknown
  let root: string | undefined
  try {
    root = await mkdtemp(join(tmpdir(), 'desktop-copilot-eval-'))
    const repositoryPath = join(root, 'repository')
    const home = join(root, 'home')
    await mkdir(repositoryPath)
    await mkdir(home)
    await mkdir(join(home, '.copilot'))
    await writeFile(join(home, 'gitconfig'), '')
    if (request.instructions?.global !== undefined) {
      await writeFile(
        join(home, '.copilot', 'copilot-instructions.md'),
        request.instructions.global
      )
    }
    const propose = async (
      input: IAssistedCommitAnalysis,
      mode: AssistedCommitPlanningMode,
      planningSignal?: AbortSignal
    ) => {
      analysis = input
      const turn = turns.length
      return runAssistedCommitPlanningRequest(
        input,
        repositoryPath,
        {
          mode,
          signal:
            signal === undefined
              ? planningSignal
              : planningSignal === undefined
              ? signal
              : AbortSignal.any([signal, planningSignal]),
          request: { kind: 'copilot', modelId: request.model },
          commitMessageRules: request.commitMessageRules,
        },
        {
          timeoutMs: request.timeoutMs,
          resolveModel: () => ({ model: request.model }),
          onResponse: content => {
            if (turns[turn] !== undefined) {
              turns[turn] = { ...turns[turn], content: content ?? null }
            }
          },
          createClient: async () => {
            const client =
              request.transport.kind === 'fixture'
                ? fixtureClient(() => fixtureContent(request, input, turn))
                : (() => {
                    const sdk = createLiveClient(repositoryPath, home)
                    return getCopilotPlanningClient(sdk, config =>
                      sdk.createSession({
                        ...config,
                        enableFileHooks: false,
                        enableConfigDiscovery: false,
                        enableSkills: false,
                      })
                    )
                  })()
            return observeClient(client, mode, request.model, turns)
          },
        }
      )
    }
    await withLocalGitEnvironment(
      {
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: join(home, '.config'),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: join(home, 'gitconfig'),
        GIT_TERMINAL_PROMPT: '0',
        GIT_AUTHOR_NAME: 'Copilot Evaluation',
        GIT_COMMITTER_NAME: 'Copilot Evaluation',
        GIT_AUTHOR_EMAIL: 'eval@example.invalid',
        GIT_COMMITTER_EMAIL: 'eval@example.invalid',
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
      },
      async () => {
        if (request.input.kind === 'repository') {
          await writeFiles(repositoryPath, request.input.baseFiles)
        }
        if (request.instructions?.repository !== undefined) {
          await writeFiles(repositoryPath, {
            '.github/copilot-instructions.md': request.instructions.repository,
          })
        }
        if (request.input.kind === 'analysis') {
          response = await propose(
            request.input.analysis,
            request.mode ?? 'plan'
          )
          validation = { kind: 'analysis' }
          return
        }
        if (request.mode !== undefined && request.mode !== 'plan') {
          throw new EvaluationRequestError(
            'Repository orchestration owns fallback planning modes'
          )
        }
        const native = async (args: string[]) =>
          (await git(args, repositoryPath, 'copilotEvaluationFixture')).stdout
        await native(['init', '--initial-branch=fixture'])
        await native(['add', '--all', '--', '.'])
        await native([
          '-c',
          'commit.gpgSign=false',
          'commit',
          '--allow-empty',
          '-m',
          'Seed evaluation fixture',
        ])
        await writeFiles(repositoryPath, request.input.files)
        const repository = new Repository(repositoryPath, 1, null, false)
        const files = await fixtureSelection(repository, request)
        const head = await native(['rev-parse', '--verify', 'HEAD'])
        const headBytes = await readFile(join(repositoryPath, '.git', 'HEAD'))
        const indexPath = join(repositoryPath, '.git', 'index')
        const index = await readFile(indexPath)
        const worktree = await worktreeDigest(repositoryPath)
        try {
          await withAssistedCommitSnapshot(
            repository,
            {
              files,
              trailers: [],
              skipCommitHooks: false,
              signOffCommits: false,
              allowEmptyCommit: false,
            },
            async snapshot => {
              analysis = snapshot.analysis
              const checked = await planAssistedCommits(snapshot, propose, {
                signal,
              })
              response = { kind: 'plan', ...checked.plan }
              validation = {
                kind: 'repository',
                selectedTree: snapshot.selectedTree,
                trees: checked.trees,
              }
            }
          )
        } finally {
          validation = {
            ...validation,
            kind: 'repository',
            preservedHead:
              head === (await native(['rev-parse', '--verify', 'HEAD'])) &&
              headBytes.equals(
                await readFile(join(repositoryPath, '.git', 'HEAD'))
              ),
            preservedIndex: index.equals(await readFile(indexPath)),
            preservedWorktree:
              worktree === (await worktreeDigest(repositoryPath)),
          }
          if (
            !validation.preservedHead ||
            !validation.preservedIndex ||
            !validation.preservedWorktree
          ) {
            throw new Error('Evaluation planning changed fixture state')
          }
        }
      }
    )
  } catch (error) {
    failed = true
    failure = error
  } finally {
    if (root !== undefined) {
      try {
        await rm(root, { recursive: true, force: true })
      } catch (cleanupError) {
        const causes = failed ? [failure, cleanupError] : [cleanupError]
        failed = true
        failure = new AggregateError(
          causes,
          'Evaluation fixture cleanup failed'
        )
      }
    }
  }
  const message = failure instanceof Error ? failure.message : String(failure)
  const token =
    process.env.COPILOT_GITHUB_TOKEN ??
    process.env.GH_TOKEN ??
    process.env.GITHUB_TOKEN
  return {
    protocolVersion: 1,
    feature: 'assisted-commit',
    transport: request.transport.kind,
    status: failed ? 'error' : 'ok',
    analysis,
    response,
    validation,
    turns,
    durationMs: performance.now() - started,
    error: !failed
      ? undefined
      : {
          name: failure instanceof Error ? failure.name : 'Error',
          code:
            failure instanceof Error &&
            'code' in failure &&
            typeof failure.code === 'string'
              ? failure.code
              : 'evaluation-error',
          message: token ? message.split(token).join('[REDACTED]') : message,
        },
  }
}
