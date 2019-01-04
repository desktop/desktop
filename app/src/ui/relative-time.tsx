import * as React from 'react'
import * as moment from 'moment'

const SECOND = 1000
const MINUTE = SECOND * 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24

type RelativeTimeResult = {
  /**
   * Represents the relative time between the current time and the provided date
   */
  readonly relativeText: string
  /**
   * The absolute timestamp for the provided date
   */
  readonly absoluteText: string
  /**
   * A timer duration to set before updating the relative text, or `null` if it
   * should be skipped
   */
  readonly timerDuration: number | null
}

/**
 * Compute the relative date information between a provided date and the current
 * date.
 */
export function getRelativeDateInfo(date: Date): RelativeTimeResult {
  const then = moment(date)
  const now = moment()
  const diff = then.diff(now)
  const duration = Math.abs(diff)
  const absoluteText = then.format('LLLL')

  let relativeText: string
  let timerDuration: number | null = null

  if (diff > 0 && duration > MINUTE) {
    // Future date, let's just show as absolute and reschedule. If it's less
    // than a minute into the future we'll treat it as 'just now'.
    relativeText = then.format('lll')
    timerDuration = duration
  } else if (duration < MINUTE) {
    relativeText = 'just now'
    timerDuration = MINUTE - duration
  } else if (duration < HOUR) {
    relativeText = then.from(now)
    timerDuration = MINUTE
  } else if (duration < DAY) {
    relativeText = then.from(now)
    timerDuration = HOUR
  } else if (duration < 7 * DAY) {
    relativeText = then.from(now)
    timerDuration = 6 * HOUR
  } else {
    relativeText = then.format('ll')
  }

  return { timerDuration, absoluteText, relativeText }
}

interface IRelativeTimeProps {
  /**
   * The date instance that will be used for calculating
   * the relative time elapsed
   */
  readonly date: Date
}

interface IRelativeTimeState {
  readonly absoluteText: string
  readonly relativeText: string
}

// The maximum value that can be used in setInterval or
// setTimeout without it overflowing (2 ^ 31 - 1). See
//  http://stackoverflow.com/a/16314807
const MAX_INTERVAL = 2147483647

/**
 * An auto-updating component rendering a relative time in human readable form.
 *
 * Example: 'just now', '4 minutes ago', '3 days ago'.
 *
 * For timestamps that are more than 7 days in the past the absolute
 * date is rendered instead.
 *
 * This component will automatically re-render when the relative time
 * changes by scheduling state changes at reasonable intervals.
 */
export class RelativeTime extends React.Component<
  IRelativeTimeProps,
  IRelativeTimeState
> {
  private timer: number | null = null

  public static getDerivedStateFromProps(
    props: IRelativeTimeProps,
    state: IRelativeTimeState
  ): IRelativeTimeState | null {
    const { absoluteText, relativeText } = getRelativeDateInfo(props.date)

    const hasStateChanged =
      absoluteText !== state.absoluteText || relativeText !== state.relativeText

    if (hasStateChanged) {
      return {
        absoluteText,
        relativeText,
      }
    }
    return null
  }

  public constructor(props: IRelativeTimeProps) {
    super(props)
    this.state = { absoluteText: '', relativeText: '' }
  }

  private clearTimer() {
    if (this.timer) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
  }

  private scheduleTimer(timeout: number) {
    this.clearTimer()
    this.timer = window.setTimeout(() => {
      const { absoluteText, relativeText } = getRelativeDateInfo(
        this.props.date
      )

      this.setState({ absoluteText, relativeText })
      this.updateTimer()
    }, Math.min(timeout, MAX_INTERVAL))
  }

  private updateTimer() {
    const { timerDuration } = getRelativeDateInfo(this.props.date)

    if (timerDuration !== null) {
      this.scheduleTimer(timerDuration)
    }
  }

  public componentDidUpdate(prevProps: IRelativeTimeProps) {
    if (this.props.date !== prevProps.date) {
      this.updateTimer()
    }
  }

  public componentDidMount() {
    this.updateTimer()
  }

  public componentWillUnmount() {
    this.clearTimer()
  }

  public shouldComponentUpdate(
    nextProps: IRelativeTimeProps,
    nextState: IRelativeTimeState
  ) {
    return (
      nextProps.date !== this.props.date ||
      nextState.absoluteText !== this.state.absoluteText ||
      nextState.relativeText !== this.state.relativeText
    )
  }

  public render() {
    return (
      <span title={this.state.absoluteText}>{this.state.relativeText}</span>
    )
  }
}
