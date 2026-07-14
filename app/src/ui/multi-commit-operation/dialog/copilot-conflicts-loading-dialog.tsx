import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../../dialog'
import { DialogHeader } from '../../dialog/header'
import { Dispatcher } from '../../dispatcher'
import { Repository } from '../../../models/repository'
import { MultiCommitOperationStepKind } from '../../../models/multi-commit-operation'
import { MultiCommitOperationConflictState } from '../../../lib/app-state'
import { IConflictResolutionProgress } from '../../../lib/copilot-conflict-resolution'
import { Button } from '../../lib/button'
import { Octicon } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'
import { MultiCommitOperationKind } from '../../../models/multi-commit-operation'
import { AriaLiveContainer } from '../../accessibility/aria-live-container'
import { IConflictResolutionModelDisplay } from '../../../lib/copilot/conflict-resolution-model'
import { formatReasoningEffort } from '../../../lib/stores/copilot-store'

interface ICopilotConflictsLoadingDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly conflictState: MultiCommitOperationConflictState
  readonly conflictedFilePaths: ReadonlyArray<string>
  readonly progress: IConflictResolutionProgress | null
  readonly operationKind: MultiCommitOperationKind
  /** The model and reasoning effort used to resolve the conflicts. */
  readonly model: IConflictResolutionModelDisplay
  readonly onAbort: () => void
  readonly onDismissed: () => void
}

interface ICopilotConflictsLoadingDialogState {
  /**
   * Internal seconds counter used to enforce per-message dwell time.
   * Not displayed to the user — the rotating message is enough signal.
   */
  readonly elapsedSeconds: number
  /**
   * The growing chat-style log of messages shown so far. Latest is at
   * the end of the array (rendered at the bottom of the visible log).
   * Capped to bound DOM size; older messages scroll out of view
   * naturally before being trimmed off the front.
   */
  readonly displayedMessages: ReadonlyArray<string>
  /**
   * High-priority messages from the SDK (model reasoning sentences).
   * Always drained before fauxPending.
   */
  readonly realPending: ReadonlyArray<string>
  /**
   * Prebuilt fallback messages used to fill space when no real messages
   * are available. Drained only when realPending is empty. Replaced
   * wholesale when the theme transitions.
   */
  readonly fauxPending: ReadonlyArray<string>
  /** Elapsed time when the most recent message was shown (for dwell). */
  readonly messageShownAt: number
  /**
   * Seconds the current message should stay visible. Randomized per
   * message so rotations don't feel mechanically timed.
   */
  readonly currentDwell: number
  /** The current theme — drives the sticky header and faux pool. */
  readonly theme: LoadingTheme
  /**
   * Becomes true once we've received a reasoning snippet from the SDK.
   * Used to flip the theme to 'analyzing' on the first signal.
   */
  readonly hasReceivedReasoning: boolean
}

/** Maximum number of historical messages to keep in the visible log. */
const MaxDisplayedMessages = 4

/** Minimum seconds a message stays visible. */
const MinDwellSeconds = 3
/** Maximum seconds a message stays visible. */
const MaxDwellSeconds = 5

/**
 * Milliseconds to wait after mount before falling back to the analyzing
 * theme even if no reasoning snippets have arrived. Guards against models
 * that emit no reasoning content.
 */
const ThemeFallbackMs = 10000

/**
 * Theme of the loading dialog. Matches a real phase of our pipeline:
 * - 'gathering': collecting conflict context, building the prompt
 * - 'analyzing': prompt sent, Copilot is reasoning / generating
 */
type LoadingTheme = 'gathering' | 'analyzing'

/** User-facing label for each theme. */
const ThemeLabels: Record<LoadingTheme, string> = {
  gathering: 'Gathering context…',
  analyzing: 'Analyzing conflicts…',
}

/** Pick a random dwell duration in [MinDwellSeconds, MaxDwellSeconds]. */
function randomDwell(): number {
  return (
    MinDwellSeconds +
    // eslint-disable-next-line insecure-random
    Math.floor(Math.random() * (MaxDwellSeconds - MinDwellSeconds + 1))
  )
}

/**
 * Faux messages for the gathering phase. These rotate while we're
 * doing local prep work (reading files, building context).
 */
function buildGatheringPool(
  filePaths: ReadonlyArray<string>
): ReadonlyArray<string> {
  const fileNames = filePaths.map(p => p.split('/').pop() ?? p)
  const pool: string[] = [
    'Reviewing the changes from each side',
    'Reading recent commit history',
    'Looking for related context',
  ]
  for (const name of fileNames.slice(0, 4)) {
    pool.push(`Reading ${name}`)
  }
  return pool
}

/**
 * Faux messages for the analyzing phase. SDK reasoning snippets always
 * preempt these — these only fill space when the model is silent.
 */
function buildAnalyzingPool(
  filePaths: ReadonlyArray<string>
): ReadonlyArray<string> {
  const fileNames = filePaths.map(p => p.split('/').pop() ?? p)
  const pool: string[] = [
    'Cross-referencing related files',
    'Considering both sides of each conflict',
  ]
  for (const name of fileNames.slice(0, 6)) {
    pool.push(`Analyzing ${name}`)
  }
  if (fileNames.length > 6) {
    pool.push(`…and ${fileNames.length - 6} more`)
  }
  return pool
}

/**
 * Filter out reasoning snippets that aren't worth surfacing — markdown
 * structural noise (headers, bullet points, bold-only labels) and
 * fragments that don't read as complete thoughts. Returns the cleaned
 * snippet, or null if it should be skipped.
 */
function cleanReasoningSnippet(snippet: string): string | null {
  const trimmed = snippet.trim()
  if (trimmed.length === 0) {
    return null
  }
  // Markdown headers
  if (/^#+\s/.test(trimmed)) {
    return null
  }
  // Bullet list items
  if (/^[-*]\s/.test(trimmed)) {
    return null
  }
  // Pure list-marker remnants like "1." or "2."
  if (/^\d+\.?$/.test(trimmed)) {
    return null
  }
  // Bold-only label with nothing meaningful after it
  if (/^\*\*[^*]+\*\*[:.]?\s*$/.test(trimmed)) {
    return null
  }
  // Numbered list items get a more lenient length check so we don't
  // drop "1. Foo" while keeping "2. Foo bar baz" — losing one item in
  // an enumerated sequence reads as a glitch.
  const isNumberedItem = /^\d+\.\s/.test(trimmed)
  const minLength = isNumberedItem ? 8 : 25
  if (trimmed.length < minLength) {
    return null
  }
  // Strip surrounding markdown emphasis from the displayed text
  return trimmed.replace(/\*\*/g, '').replace(/`/g, '')
}

const CopilotConflictsLoadingDialogId = 'Dialog_Copilot_Conflicts_Loading'

/**
 * A loading interstitial shown while Copilot is resolving conflicts.
 *
 * The dialog is structured around two themes that mirror our pipeline:
 * 'gathering' (local prep work) and 'analyzing' (the model is reasoning
 * / generating). Each theme has its own pool of faux messages that
 * rotate while the user waits. Live reasoning snippets from the SDK
 * always preempt faux messages so the user sees real model thoughts
 * the moment they arrive.
 */
export class CopilotConflictsLoadingDialog extends React.Component<
  ICopilotConflictsLoadingDialogProps,
  ICopilotConflictsLoadingDialogState
> {
  private timer: ReturnType<typeof setInterval> | null = null
  private themeFallbackTimer: ReturnType<typeof setTimeout> | null = null
  private logRef = React.createRef<HTMLDivElement>()
  /**
   * Wall-clock timestamp (ms) captured when the dialog mounts. Elapsed time
   * is derived from this on every tick rather than counting ticks, so the
   * message rotation stays accurate even when the interval is throttled
   * (e.g. while the app is backgrounded).
   */
  private startTimeMs = 0

  public constructor(props: ICopilotConflictsLoadingDialogProps) {
    super(props)
    const pool = buildGatheringPool(props.conflictedFilePaths)
    const [first, ...rest] = pool
    this.state = {
      elapsedSeconds: 0,
      displayedMessages: first !== undefined ? [first] : [],
      realPending: [],
      fauxPending: rest,
      messageShownAt: 0,
      currentDwell: randomDwell(),
      theme: 'gathering',
      hasReceivedReasoning: false,
    }
  }

  public componentDidMount() {
    this.startTimeMs = Date.now()
    this.timer = setInterval(this.tick, 1000)
    // Safety net: if the model never streams reasoning we'd be stuck on
    // 'gathering' indefinitely. After a generous window, advance to
    // 'analyzing' on our own.
    this.themeFallbackTimer = setTimeout(() => {
      this.themeFallbackTimer = null
      this.advanceToAnalyzing()
    }, ThemeFallbackMs)
  }

  public componentWillUnmount() {
    if (this.timer !== null) {
      clearInterval(this.timer)
    }
    if (this.themeFallbackTimer !== null) {
      clearTimeout(this.themeFallbackTimer)
    }
  }

  public componentDidUpdate(
    prevProps: ICopilotConflictsLoadingDialogProps,
    prevState: ICopilotConflictsLoadingDialogState
  ) {
    const prevSnippet = prevProps.progress?.reasoningSnippet
    const currentSnippet = this.props.progress?.reasoningSnippet

    if (currentSnippet !== undefined && currentSnippet !== prevSnippet) {
      const cleaned = cleanReasoningSnippet(currentSnippet)
      if (__DEV__) {
        if (cleaned === null) {
          console.log(
            `[Copilot SDK] dialog dropped snippet: ${JSON.stringify(
              currentSnippet
            )}`
          )
        } else {
          console.log(
            `[Copilot SDK] dialog kept snippet: ${JSON.stringify(cleaned)}`
          )
        }
      }
      if (cleaned !== null) {
        this.setState(prev => ({
          realPending: [...prev.realPending, cleaned],
        }))
      }
      // First reasoning snippet means Copilot is past gathering —
      // promote the theme even if cleaning rejected this particular line.
      this.advanceToAnalyzing()
    }

    // Only re-measure the (potentially expensive) DOM layout when the
    // rendered messages actually changed — other state updates (e.g.
    // incoming reasoning snippets) don't affect the log's height.
    if (prevState.displayedMessages !== this.state.displayedMessages) {
      this.trimOverflowingMessages()
    }
  }

  /**
   * Promote the dialog to the 'analyzing' theme if it hasn't already
   * been promoted. Replaces the faux pool with the analyzing pool but
   * leaves the displayed log alone — it's history.
   */
  private advanceToAnalyzing() {
    if (this.themeFallbackTimer !== null) {
      clearTimeout(this.themeFallbackTimer)
      this.themeFallbackTimer = null
    }

    this.setState(prev => {
      if (prev.hasReceivedReasoning && prev.theme === 'analyzing') {
        return null
      }
      return {
        theme: 'analyzing',
        hasReceivedReasoning: true,
        fauxPending: buildAnalyzingPool(this.props.conflictedFilePaths),
      }
    })
  }

  /**
   * If the rendered log content is taller than its container, drop the
   * oldest message(s) until it fits. This keeps the latest message
   * fully visible without having to anchor to the bottom.
   */
  private trimOverflowingMessages() {
    const log = this.logRef.current
    if (log === null) {
      return
    }

    if (log.scrollHeight <= log.clientHeight) {
      return
    }

    this.setState(prev => {
      if (prev.displayedMessages.length <= 1) {
        return null
      }
      return { displayedMessages: prev.displayedMessages.slice(1) }
    })
  }

  private tick = () => {
    this.setState(prev => {
      // Derive elapsed time from the wall clock rather than incrementing a
      // counter, so a throttled/coalesced interval (backgrounded app)
      // doesn't cause the timer to drift behind real time.
      const nextElapsed = Math.round((Date.now() - this.startTimeMs) / 1000)
      const dwelt = nextElapsed - prev.messageShownAt

      if (dwelt < prev.currentDwell) {
        return { ...prev, elapsedSeconds: nextElapsed }
      }

      const appendMessage = (
        next: string,
        realPending: ReadonlyArray<string>,
        fauxPending: ReadonlyArray<string>
      ) => {
        const merged = [...prev.displayedMessages, next]
        const displayedMessages =
          merged.length > MaxDisplayedMessages
            ? merged.slice(merged.length - MaxDisplayedMessages)
            : merged
        return {
          ...prev,
          elapsedSeconds: nextElapsed,
          displayedMessages,
          realPending,
          fauxPending,
          messageShownAt: nextElapsed,
          currentDwell: randomDwell(),
        }
      }

      // Always drain real (SDK) messages first; fall back to faux only
      // when there's nothing real to show.
      if (prev.realPending.length > 0) {
        const [next, ...rest] = prev.realPending
        return appendMessage(next, rest, prev.fauxPending)
      }

      if (prev.fauxPending.length > 0) {
        const [next, ...rest] = prev.fauxPending
        return appendMessage(next, prev.realPending, rest)
      }

      return { ...prev, elapsedSeconds: nextElapsed }
    })
  }

  private onCancel = () => {
    const { dispatcher, repository, conflictState } = this.props

    // Actually tear down the in-flight Copilot turn so it stops consuming work
    // in the background, then return the user to the manual conflicts list.
    dispatcher.abortCopilotConflictResolution(repository)

    dispatcher.setMultiCommitOperationStepWithCopilotResolution(
      repository,
      {
        kind: MultiCommitOperationStepKind.ShowConflicts,
        conflictState,
      },
      false
    )
  }

  public render() {
    const { displayedMessages, theme } = this.state
    const { operationKind, model } = this.props
    const latestMessage =
      displayedMessages.length > 0
        ? displayedMessages[displayedMessages.length - 1]
        : null

    const modelLabel =
      model.reasoningEffort !== undefined
        ? `${model.modelName} · ${formatReasoningEffort(model.reasoningEffort)}`
        : model.modelName

    return (
      <Dialog
        id="copilot-conflicts-loading"
        titleId={CopilotConflictsLoadingDialogId}
        onDismissed={this.props.onDismissed}
      >
        <DialogHeader
          title={`Resolving conflicts for ${operationKind.toLowerCase()}`}
          titleId={CopilotConflictsLoadingDialogId}
          showCloseButton={true}
          onCloseButtonClick={this.props.onDismissed}
        >
          <span className="copilot-conflicts-loading-model">{modelLabel}</span>
        </DialogHeader>
        <DialogContent>
          <div className="copilot-conflicts-loading-content">
            <div className="copilot-conflicts-loading-theme">
              <Octicon
                className="copilot-conflicts-loading-theme-icon"
                symbol={octicons.copilot}
              />
              <span className="copilot-conflicts-loading-theme-label">
                {ThemeLabels[theme]}
              </span>
            </div>
            <div
              ref={this.logRef}
              className={
                displayedMessages.length >= MaxDisplayedMessages
                  ? 'copilot-conflicts-loading-log is-scrolling'
                  : 'copilot-conflicts-loading-log'
              }
            >
              {displayedMessages.map((msg, i) => (
                <p
                  key={`${i}-${msg}`}
                  className="copilot-conflicts-loading-log-line"
                >
                  {msg}
                </p>
              ))}
            </div>
            <AriaLiveContainer message={latestMessage} />
            <AriaLiveContainer message={ThemeLabels[theme]} />
          </div>
        </DialogContent>
        <DialogFooter>
          <div className="copilot-conflicts-loading-footer">
            <Button
              className="copilot-conflicts-loading-stop"
              onClick={this.onCancel}
            >
              <Octicon
                className="copilot-conflicts-loading-stop-icon"
                symbol={octicons.squareFill}
              />
              Stop
            </Button>
            <Button onClick={this.props.onAbort}>
              Abort {operationKind.toLowerCase()}
            </Button>
          </div>
        </DialogFooter>
      </Dialog>
    )
  }
}
