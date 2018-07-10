import * as React from 'react'
import * as moment from 'moment'

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

const SECOND = 1000
const MINUTE = SECOND * 60
const HOUR = MINUTE * 60
const DAY = HOUR * 24

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

  private updateAndSchedule(
    absoluteText: string,
    relativeText: string,
    timeout: number
  ) {
    this.clearTimer()
    this.timer = window.setTimeout(
      this.updateFromScheduler,
      Math.min(timeout, MAX_INTERVAL)
    )
    this.setState({ absoluteText, relativeText })
  }

  private updateWithDate(date: Date) {
    const then = moment(date)
    const now = moment()
    const diff = then.diff(now)
    const duration = Math.abs(diff)
    const absoluteText = then.format('LLLL')

    // Future date, let's just show as absolute and reschedule. If it's less
    // than a minute into the future we'll treat it as 'just now'.
    if (diff > 0 && duration > MINUTE) {
      this.updateAndSchedule(absoluteText, then.format('lll'), duration)
    } else if (duration < MINUTE) {
      this.updateAndSchedule(absoluteText, 'just now', MINUTE - duration)
    } else if (duration < HOUR) {
      this.updateAndSchedule(absoluteText, then.from(now), MINUTE)
    } else if (duration < DAY) {
      this.updateAndSchedule(absoluteText, then.from(now), HOUR)
    } else if (duration < 7 * DAY) {
      this.updateAndSchedule(absoluteText, then.from(now), 6 * HOUR)
    } else {
      this.setState({ absoluteText, relativeText: then.format('ll') })
    }
  }

  private readonly updateFromScheduler = () => {
    this.updateWithDate(this.props.date)
  }

  public componentWillReceiveProps(nextProps: IRelativeTimeProps) {
    if (this.props.date !== nextProps.date) {
      this.updateWithDate(nextProps.date)
    }
  }

  public componentWillMount() {
    this.updateWithDate(this.props.date)
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
