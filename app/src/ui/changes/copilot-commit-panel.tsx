import * as React from 'react'
import classNames from 'classnames'
import {
  CopilotAnimation,
  CopilotAnimationKind,
} from '../copilot-animation/copilot-animation'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { AriaLiveContainer } from '../accessibility/aria-live-container'

/** The one-shot animations the mascot plays in response to the user. */
type CopilotReaction = 'celebrate' | 'tickle' | 'jump-wiggle'

/** How many clicks in a row it takes to make Copilot celebrate. */
const ClicksToCelebrate = 5

/** How long (in milliseconds) between clicks for them to count as a streak. */
const ClickStreakTimeout = 800

/** The number of sparkles in a burst. */
const SparkleCount = 6

interface ICopilotCommitPanelProps {
  /** The number of files selected to be committed. */
  readonly filesSelectedCount: number

  /** Whether Copilot is busy working on the commits. */
  readonly isWorking: boolean
}

interface ICopilotCommitPanelState {
  /** The one-shot animation currently playing, if any. */
  readonly reaction: CopilotReaction | null

  /**
   * Whether the thinking animation is playing. This lags behind `isWorking`
   * so the animation can play its ending phase once Copilot is done.
   */
  readonly isThinking: boolean

  /** Incremented to (re)start a sparkle burst. */
  readonly sparkleBurst: number
}

/**
 * The panel shown in place of the commit summary and description fields when
 * the user commits with Copilot.
 *
 * Copilot sits in the middle of the panel, follows the mouse around, gets
 * ticklish when hovered, and jumps when clicked. Click it enough times and it
 * will celebrate.
 */
export class CopilotCommitPanel extends React.Component<
  ICopilotCommitPanelProps,
  ICopilotCommitPanelState
> {
  public static getDerivedStateFromProps(
    props: ICopilotCommitPanelProps,
    state: ICopilotCommitPanelState
  ): Partial<ICopilotCommitPanelState> | null {
    return props.isWorking && !state.isThinking
      ? { isThinking: true, reaction: null }
      : null
  }

  private panelRef = React.createRef<HTMLDivElement>()
  private headRef = React.createRef<HTMLDivElement>()
  private pointerFrameId: number | null = null
  private lastPointer: { readonly x: number; readonly y: number } | null = null
  private clickTimestamps: ReadonlyArray<number> = []

  public constructor(props: ICopilotCommitPanelProps) {
    super(props)

    this.state = {
      // Make an entrance!
      reaction: 'celebrate',
      isThinking: props.isWorking,
      sparkleBurst: 1,
    }
  }

  public componentWillUnmount() {
    if (this.pointerFrameId !== null) {
      cancelAnimationFrame(this.pointerFrameId)
    }
  }

  private onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    this.lastPointer = { x: event.clientX, y: event.clientY }

    if (this.pointerFrameId === null) {
      this.pointerFrameId = requestAnimationFrame(this.updatePointer)
    }
  }

  private onMouseLeave = () => {
    this.lastPointer = null

    if (this.pointerFrameId === null) {
      this.pointerFrameId = requestAnimationFrame(this.updatePointer)
    }
  }

  /**
   * Update the CSS custom properties that make Copilot look at the pointer
   * and the glow follow it. This is done outside of React's render cycle so
   * that moving the mouse doesn't cause re-renders.
   */
  private updatePointer = () => {
    this.pointerFrameId = null

    const panel = this.panelRef.current
    const head = this.headRef.current
    if (panel === null || head === null) {
      return
    }

    const pointer = this.lastPointer
    if (pointer === null) {
      panel.style.setProperty('--look-x', '0')
      panel.style.setProperty('--look-y', '0')
      panel.classList.remove('pointer-inside')
      return
    }

    const panelRect = panel.getBoundingClientRect()
    const headRect = head.getBoundingClientRect()
    const headX = headRect.left + headRect.width / 2
    const headY = headRect.top + headRect.height / 2

    const lookX = clamp((pointer.x - headX) / (panelRect.width / 2), -1, 1)
    const lookY = clamp((pointer.y - headY) / (panelRect.height / 2), -1, 1)

    panel.style.setProperty('--look-x', lookX.toFixed(3))
    panel.style.setProperty('--look-y', lookY.toFixed(3))
    panel.style.setProperty('--pointer-x', `${pointer.x - panelRect.left}px`)
    panel.style.setProperty('--pointer-y', `${pointer.y - panelRect.top}px`)
    panel.classList.add('pointer-inside')
  }

  private onHeadMouseEnter = () => {
    if (this.state.reaction === null && !this.state.isThinking) {
      this.setState({ reaction: 'tickle' })
    }
  }

  private onHeadClick = () => {
    if (this.state.isThinking) {
      return
    }

    const now = Date.now()
    const lastClick = this.clickTimestamps.at(-1)
    const isStreak =
      lastClick !== undefined && now - lastClick < ClickStreakTimeout
    this.clickTimestamps = isStreak ? [...this.clickTimestamps, now] : [now]

    if (this.clickTimestamps.length >= ClicksToCelebrate) {
      this.clickTimestamps = []
      this.setState(state => ({
        reaction: 'celebrate',
        sparkleBurst: state.sparkleBurst + 1,
      }))
    } else if (this.state.reaction !== 'celebrate') {
      this.setState({ reaction: 'jump-wiggle' })
    }
  }

  private onAnimationEnd = () => {
    if (this.state.isThinking && !this.props.isWorking) {
      this.setState({ isThinking: false })
    } else {
      this.setState({ reaction: null })
    }
  }

  private getAnimation(): CopilotAnimationKind {
    const { isThinking, reaction } = this.state
    return isThinking ? 'thinking' : reaction ?? 'idle'
  }

  private renderSparkles() {
    const { sparkleBurst } = this.state
    const sparkles = new Array<JSX.Element>()

    for (let i = 0; i < SparkleCount; i++) {
      sparkles.push(
        <span key={i} className={`sparkle sparkle-${i}`}>
          <Octicon symbol={octicons.sparkleFill} />
        </span>
      )
    }

    // Changing the key restarts the burst's CSS animations
    return (
      <div className="sparkles" key={sparkleBurst}>
        {sparkles}
      </div>
    )
  }

  private renderCaption() {
    const { isWorking, filesSelectedCount } = this.props

    if (isWorking) {
      return (
        <>
          <div className="title working">Copilot is on it…</div>
          <div className="description">
            Splitting your changes into commits and writing their messages.
          </div>
        </>
      )
    }

    const description =
      filesSelectedCount === 0
        ? 'Select the changes you want to commit and Copilot will split them into commits and write their messages.'
        : `Copilot will split the ${filesSelectedCount} selected ${
            filesSelectedCount === 1 ? 'file' : 'files'
          } into commits and write their messages.`

    return (
      <>
        <div className="title">Let Copilot write your commits</div>
        <div className="description">{description}</div>
      </>
    )
  }

  public render() {
    const animation = this.getAnimation()
    const { isThinking } = this.state
    const className = classNames('copilot-commit-panel', {
      working: this.props.isWorking,
    })
    const headClassName = classNames('copilot-head', `reaction-${animation}`)

    return (
      <div
        className={className}
        ref={this.panelRef}
        onMouseMove={this.onMouseMove}
        onMouseLeave={this.onMouseLeave}
      >
        <div className="glow" />
        <div className="copilot-stage">
          {this.renderSparkles()}
          {/*
           * Poking Copilot is a purely decorative easter egg, so it's
           * intentionally not exposed to keyboard or assistive technology users.
           */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            className={headClassName}
            ref={this.headRef}
            onMouseEnter={this.onHeadMouseEnter}
            onClick={this.onHeadClick}
          >
            <CopilotAnimation
              animation={animation}
              loop={
                animation === 'idle' || (isThinking && this.props.isWorking)
              }
              size={48}
              onAnimationEnd={this.onAnimationEnd}
            />
          </div>
          <div className="copilot-shadow" />
        </div>
        <div className="caption">{this.renderCaption()}</div>
        <AriaLiveContainer
          message={
            this.props.isWorking
              ? 'Copilot is splitting your changes into commits'
              : null
          }
          trackedUserInput={this.props.isWorking}
        />
      </div>
    )
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
