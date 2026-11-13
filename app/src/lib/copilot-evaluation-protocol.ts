/** Capabilities exposed to the private evaluator by this Desktop revision. */
export const CopilotEvaluationCapabilities = {
  protocolVersion: 1,
  features: ['assisted-commit'],
  inputKinds: ['analysis', 'repository'],
} as const

/** Selected-only adapter data, independent of application or Electron imports. */
export interface IEvaluationAnalysis {
  readonly snapshotId: string
  readonly changes: ReadonlyArray<{
    readonly id: string
    readonly kind: 'text-hunk' | 'atomic'
    readonly path: string
    readonly oldPath?: string
    readonly diff: string
  }>
}

type AssistedCommitPlanningMode = 'plan' | 'single-commit'

type CopilotAssistedCommitResponse =
  | {
      readonly kind: 'plan'
      readonly snapshotId: string
      readonly commits: ReadonlyArray<{
        readonly title: string
        readonly description?: string
        readonly changeIds: ReadonlyArray<string>
      }>
    }
  | {
      readonly kind: 'uncertain-boundaries'
      readonly snapshotId: string
      readonly title: string
      readonly description?: string
    }

/** Serializable fixture inputs; paths are relative to a disposable repository. */
export interface IEvaluationRepositoryInput {
  readonly kind: 'repository'
  readonly baseFiles: Readonly<Record<string, string>>
  readonly files: Readonly<Record<string, string | null>>
  readonly selection: ReadonlyArray<{
    readonly path: string
    /** Zero-based selected text hunk indices; omitted means the entire file. */
    readonly hunks?: ReadonlyArray<number>
  }>
}

/** A scripted model response, available only in explicitly offline evaluations. */
export type EvaluationFixtureResponse =
  | { readonly type: 'raw'; readonly content: string }
  | {
      readonly type: 'plan'
      readonly groups: ReadonlyArray<{
        readonly title: string
        readonly description?: string
        /** Omitted means every selected unit, otherwise all units on these paths. */
        readonly paths?: ReadonlyArray<string>
      }>
    }
  | {
      readonly type: 'uncertain-boundaries'
      readonly title: string
      readonly description?: string
    }

/** Versioned adapter input. The private evaluator supplies validated plain data. */
export interface ICopilotEvaluationRequest {
  readonly protocolVersion: 1
  readonly feature: 'assisted-commit'
  readonly model: string
  readonly input:
    | IEvaluationRepositoryInput
    | {
        readonly kind: 'analysis'
        readonly analysis: IEvaluationAnalysis
      }
  readonly transport:
    | { readonly kind: 'copilot' }
    | {
        readonly kind: 'fixture'
        readonly responses: ReadonlyArray<EvaluationFixtureResponse>
      }
  readonly mode?: AssistedCommitPlanningMode
  readonly timeoutMs?: number
  readonly instructions?: {
    readonly repository?: string
    readonly global?: string
  }
  readonly commitMessageRules?: ReadonlyArray<{
    readonly enforced: boolean | 'bypass'
    readonly humanDescription: string
  }>
}

/** Approved benchmark observations, not SDK journals or credential material. */
export interface ICopilotEvaluationTurn {
  readonly mode: AssistedCommitPlanningMode
  readonly model: string
  readonly systemPrompt: string
  readonly userPrompt: string
  /** Exact per-run schema supplied to the SDK; absent in legacy bridge results. */
  readonly responseSchema?: Readonly<Record<string, unknown>>
  readonly content: string | null
  readonly durationMs: number
}

/** Stable bridge envelope, including observations collected before a failure. */
export interface ICopilotEvaluationResult {
  readonly protocolVersion: 1
  readonly feature: 'assisted-commit'
  readonly status: 'ok' | 'error'
  readonly transport: 'copilot' | 'fixture' | 'unknown'
  readonly analysis?: IEvaluationAnalysis
  readonly response?: CopilotAssistedCommitResponse
  readonly validation?: {
    readonly kind: 'analysis' | 'repository'
    readonly trees?: ReadonlyArray<string>
    readonly selectedTree?: string
    readonly preservedHead?: boolean
    readonly preservedIndex?: boolean
    readonly preservedWorktree?: boolean
  }
  readonly turns: ReadonlyArray<ICopilotEvaluationTurn>
  readonly durationMs: number
  readonly error?: {
    readonly name: string
    readonly code: string
    readonly message: string
  }
}
