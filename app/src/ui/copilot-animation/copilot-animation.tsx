import * as React from 'react'
import classNames from 'classnames'
import { assertNever } from '../../lib/fatal-error'
import { ICopilotSprite } from './sprites/copilot-sprite'
import { staticSprite } from './sprites/static'
import { idleSprite } from './sprites/idle'
import { tickleSprite } from './sprites/tickle'
import { jumpWiggleSprite } from './sprites/jump-wiggle'
import { celebrateSprite } from './sprites/celebrate'
import { thinkingSprite } from './sprites/thinking'

/** The animations the Copilot mascot can play. */
export type CopilotAnimationKind =
  | 'static'
  | 'idle'
  | 'tickle'
  | 'jump-wiggle'
  | 'celebrate'
  | 'thinking'

/**
 * The phase an animation is in. Each phase maps to a different CSS animation
 * of the sprite strip (see `app/styles/ui/_copilot-animation.scss`).
 */
export type CopilotAnimationPhase = 'idle' | 'starting' | 'running' | 'ending'

interface ICopilotAnimationTimings {
  readonly idle?: number
  readonly starting?: number
  readonly running?: number
  readonly ending?: number
}

const sprites: Record<CopilotAnimationKind, ICopilotSprite> = {
  static: staticSprite,
  idle: idleSprite,
  tickle: tickleSprite,
  'jump-wiggle': jumpWiggleSprite,
  celebrate: celebrateSprite,
  thinking: thinkingSprite,
}

/** How long (in milliseconds) each phase of each animation lasts. */
const timings: Record<CopilotAnimationKind, ICopilotAnimationTimings | null> = {
  static: null,
  idle: { running: 13483 },
  tickle: { idle: 33, running: 1188 },
  'jump-wiggle': { idle: 33, running: 1254 },
  celebrate: { idle: 33, running: 1056 },
  thinking: { idle: 33, starting: 429, running: 1390, ending: 429 },
}

/** The stylesheet scales sprite frame offsets using this custom property. */
interface ICopilotAnimationStyle {
  readonly '--copilot-animation-scale': number
}

interface ICopilotAnimationProps {
  /** The animation to play. */
  readonly animation: CopilotAnimationKind

  /**
   * Whether the animation should loop. When a looping animation stops looping
   * it finishes its current cycle (and its ending phase, if any) before
   * invoking `onAnimationEnd`.
   */
  readonly loop: boolean

  /** Rendered size in pixels. Defaults to 32. */
  readonly size?: number

  readonly className?: string

  /** Called once a non-looping animation has finished playing. */
  readonly onAnimationEnd?: () => void
}

interface ICopilotAnimationState {
  readonly phase: CopilotAnimationPhase

  /** Whether the current animation has played through at least once. */
  readonly hasPlayed: boolean
}

/**
 * An animated Copilot mascot.
 *
 * The animations are frame-by-frame sprite strips driven by CSS. This
 * component drives the state machine which moves each animation through its
 * idle -> starting -> running -> ending phases. Users who prefer reduced motion
 * will see a static frame.
 */
export class CopilotAnimation extends React.Component<
  ICopilotAnimationProps,
  ICopilotAnimationState
> {
  private timeoutId: number | null = null
  private runningSince: number | null = null

  public constructor(props: ICopilotAnimationProps) {
    super(props)
    this.state = { phase: 'idle', hasPlayed: false }
  }

  public componentDidMount() {
    this.scheduleNextPhase()
  }

  public componentDidUpdate(
    prevProps: ICopilotAnimationProps,
    prevState: ICopilotAnimationState
  ) {
    if (prevProps.animation !== this.props.animation) {
      this.runningSince = null
      this.setState({ phase: 'idle', hasPlayed: false }, () =>
        this.scheduleNextPhase()
      )
    } else if (
      prevState.phase !== this.state.phase ||
      prevProps.loop !== this.props.loop
    ) {
      this.scheduleNextPhase()
    }
  }

  public componentWillUnmount() {
    this.clearTimeout()
  }

  private clearTimeout() {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  private schedule(fn: () => void, delay: number) {
    if (delay <= 0) {
      fn()
      return
    }

    this.timeoutId = window.setTimeout(() => {
      this.timeoutId = null
      fn()
    }, delay)
  }

  private get timing() {
    return timings[this.props.animation]
  }

  private scheduleNextPhase() {
    this.clearTimeout()

    const { loop } = this.props
    const { phase, hasPlayed } = this.state
    const timing = this.timing

    if (timing === null) {
      return
    }

    switch (phase) {
      case 'idle':
        if (loop || !hasPlayed) {
          this.schedule(this.start, timing.idle ?? 0)
        }
        break
      case 'starting':
        this.schedule(this.run, timing.starting ?? 0)
        break
      case 'running':
        if (!loop) {
          // Let the current cycle finish before moving on
          const duration = timing.running ?? 0
          const elapsed =
            this.runningSince === null ? 0 : Date.now() - this.runningSince
          const remaining =
            duration > 0 ? duration - (elapsed % duration) : duration
          this.schedule(this.end, remaining)
        }
        break
      case 'ending':
        this.schedule(this.finish, timing.ending ?? 0)
        break
      default:
        assertNever(phase, `Unknown animation phase: ${phase}`)
    }
  }

  private start = () => {
    if (this.timing?.starting !== undefined) {
      this.setState({ phase: 'starting' })
    } else {
      this.run()
    }
  }

  private run = () => {
    this.runningSince = Date.now()
    this.setState({ phase: 'running' })
  }

  private end = () => {
    if (this.timing?.ending !== undefined) {
      this.setState({ phase: 'ending' })
    } else {
      this.finish()
    }
  }

  private finish = () => {
    this.setState({ phase: 'idle', hasPlayed: true })
    if (!this.props.loop) {
      this.props.onAnimationEnd?.()
    }
  }

  public render() {
    const { animation, className } = this.props
    const size = Math.max(this.props.size ?? 32, 16)
    const scale = size / 32
    const sprite = sprites[animation]
    const style: React.CSSProperties & ICopilotAnimationStyle = {
      '--copilot-animation-scale': scale,
    }

    return (
      <div
        className={classNames('copilot-animation', className)}
        style={style}
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={32 * scale}
          height={sprite.height * scale}
          viewBox={`0 0 32 ${sprite.height}`}
          className={`copilot-sprite copilot-sprite-${animation}`}
          data-animation-state={this.state.phase}
          fill="currentColor"
          aria-hidden="true"
        >
          {sprite.paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      </div>
    )
  }
}
