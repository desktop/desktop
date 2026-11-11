import {
  EvaluationFixtureResponse,
  ICopilotEvaluationRequest,
  IEvaluationAnalysis,
  IEvaluationRepositoryInput,
} from './protocol'

/** Invalid bridge input, rejected before credentials or model work. */
export class EvaluationRequestError extends Error {
  public readonly code = 'invalid-request'
}

function invalid(message: string): never {
  throw new EvaluationRequestError(message)
}

function object(
  value: unknown,
  keys: ReadonlyArray<string>
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return invalid('Expected an object with only supported fields')
  }
  const entries = Object.entries(Object.getOwnPropertyDescriptors(value))
  if (
    entries.some(
      ([key, property]) => !keys.includes(key) || !('value' in property)
    )
  ) {
    return invalid('Expected plain data fields')
  }
  return Object.fromEntries(
    entries.map(([key, property]) => [key, property.value])
  )
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : invalid('Expected a string')
}

function optionalText(value: unknown): string | undefined {
  return value === undefined ? undefined : text(value)
}

function array<T>(
  value: unknown,
  parse: (entry: unknown) => T
): ReadonlyArray<T> {
  if (!Array.isArray(value)) {
    return invalid('Expected an array')
  }
  return value.map(parse)
}

/** Portable fixture paths may never escape the owned directory or write Git metadata. */
export function assertEvaluationPath(path: string): void {
  if (
    path.length === 0 ||
    /[\\:\0]/.test(path) ||
    path.split('/').some(part => {
      const lower = part.toLowerCase()
      return (
        part.length === 0 ||
        part === '.' ||
        part === '..' ||
        lower.replace(/[. ]+$/, '') === '.git' ||
        lower === '.git' ||
        /^git~[0-9]+$/i.test(part)
      )
    })
  ) {
    invalid(`Unsafe fixture path: ${JSON.stringify(path)}`)
  }
}

function files(value: unknown): Readonly<Record<string, string>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('Expected a file map')
  }
  return Object.fromEntries(
    Object.entries(value).map(([path, content]) => {
      assertEvaluationPath(path)
      return [path, text(content)]
    })
  )
}

function analysis(value: unknown): IEvaluationAnalysis {
  const raw = object(value, ['snapshotId', 'changes'])
  return {
    snapshotId: text(raw.snapshotId),
    changes: array(raw.changes, entry => {
      const change = object(entry, ['id', 'kind', 'path', 'oldPath', 'diff'])
      if (change.kind !== 'text-hunk' && change.kind !== 'atomic') {
        return invalid('Unknown selected change kind')
      }
      return {
        id: text(change.id),
        kind: change.kind,
        path: text(change.path),
        oldPath: optionalText(change.oldPath),
        diff: text(change.diff),
      }
    }),
  }
}

function repository(value: unknown): IEvaluationRepositoryInput {
  const raw = object(value, ['kind', 'baseFiles', 'files', 'selection'])
  const changes = raw.files
  if (
    changes === null ||
    typeof changes !== 'object' ||
    Array.isArray(changes)
  ) {
    return invalid('Expected changed files')
  }
  const seen = new Set<string>()
  return {
    kind: 'repository',
    baseFiles: files(raw.baseFiles),
    files: Object.fromEntries(
      Object.entries(changes).map(([path, content]) => {
        assertEvaluationPath(path)
        return [path, content === null ? null : text(content)]
      })
    ),
    selection: array(raw.selection, entry => {
      const selected = object(entry, ['path', 'hunks'])
      const path = text(selected.path)
      assertEvaluationPath(path)
      if (seen.has(path)) {
        return invalid('Duplicate selected fixture path')
      }
      seen.add(path)
      return {
        path,
        hunks:
          selected.hunks === undefined
            ? undefined
            : array(selected.hunks, index => {
                if (
                  typeof index !== 'number' ||
                  !Number.isSafeInteger(index) ||
                  index < 0
                ) {
                  return invalid('Hunk indices must be nonnegative integers')
                }
                return index
              }),
      }
    }),
  }
}

function fixtureResponse(value: unknown): EvaluationFixtureResponse {
  const discriminant = object(value, [
    'type',
    'content',
    'groups',
    'title',
    'description',
    'reason',
  ])
  switch (discriminant.type) {
    case 'raw': {
      const raw = object(value, ['type', 'content'])
      return { type: 'raw', content: text(raw.content) }
    }
    case 'plan': {
      const raw = object(value, ['type', 'groups'])
      return {
        type: 'plan',
        groups: array(raw.groups, entry => {
          const group = object(entry, ['title', 'description', 'paths'])
          return {
            title: text(group.title),
            description: optionalText(group.description),
            paths:
              group.paths === undefined ? undefined : array(group.paths, text),
          }
        }),
      }
    }
    case 'unsafe': {
      const raw = object(value, ['type', 'reason'])
      return { type: 'unsafe', reason: text(raw.reason) }
    }
    case 'uncertain-boundaries': {
      const raw = object(value, ['type', 'title', 'description'])
      return {
        type: 'uncertain-boundaries',
        title: text(raw.title),
        description: optionalText(raw.description),
      }
    }
    default:
      return invalid('Unknown fixture response type')
  }
}

/** Parse untrusted JSON without assertions, unknown fields, or executable inputs. */
export function parseCopilotEvaluationRequest(
  value: unknown
): ICopilotEvaluationRequest {
  const raw = object(value, [
    'protocolVersion',
    'feature',
    'model',
    'input',
    'transport',
    'mode',
    'timeoutMs',
    'instructions',
    'commitMessageRules',
  ])
  if (
    raw.protocolVersion !== 1 ||
    raw.feature !== 'assisted-commit' ||
    text(raw.model).trim().length === 0
  ) {
    return invalid('Unsupported bridge version, feature, or model')
  }
  const input = object(raw.input, [
    'kind',
    'analysis',
    'baseFiles',
    'files',
    'selection',
  ])
  if (input.kind !== 'analysis' && input.kind !== 'repository') {
    return invalid('Unknown evaluation input kind')
  }
  if (input.kind === 'analysis') {
    object(raw.input, ['kind', 'analysis'])
  }
  const transport = object(raw.transport, ['kind', 'responses'])
  if (transport.kind !== 'copilot' && transport.kind !== 'fixture') {
    return invalid('Unknown evaluation transport')
  }
  if (transport.kind === 'copilot') {
    object(raw.transport, ['kind'])
  }
  if (
    raw.mode !== undefined &&
    raw.mode !== 'plan' &&
    raw.mode !== 'single-commit'
  ) {
    return invalid('Unknown planning mode')
  }
  if (raw.timeoutMs !== undefined && typeof raw.timeoutMs !== 'number') {
    return invalid('Expected a numeric request timeout')
  }
  const instructions =
    raw.instructions === undefined
      ? undefined
      : object(raw.instructions, ['repository', 'global'])
  return {
    protocolVersion: 1,
    feature: 'assisted-commit',
    model: text(raw.model),
    input:
      input.kind === 'analysis'
        ? { kind: 'analysis', analysis: analysis(input.analysis) }
        : repository(raw.input),
    transport:
      transport.kind === 'copilot'
        ? { kind: 'copilot' }
        : {
            kind: 'fixture',
            responses: array(transport.responses, fixtureResponse),
          },
    mode: raw.mode,
    timeoutMs: raw.timeoutMs,
    instructions:
      instructions === undefined
        ? undefined
        : {
            repository: optionalText(instructions.repository),
            global: optionalText(instructions.global),
          },
    commitMessageRules:
      raw.commitMessageRules === undefined
        ? undefined
        : array(raw.commitMessageRules, value => {
            const rule = object(value, ['enforced', 'humanDescription'])
            if (
              typeof rule.enforced !== 'boolean' &&
              rule.enforced !== 'bypass'
            ) {
              return invalid('Unknown rule enforcement')
            }
            return {
              enforced: rule.enforced,
              humanDescription: text(rule.humanDescription),
            }
          }),
  }
}
