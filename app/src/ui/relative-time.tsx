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
export class RelativeTime extends React.Component<IRelativeTimeProps, IRelativeTimeState> {

  private timer: number | null

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private updateAndSchedule(absoluteText: string, relativeText: string, timeout: number) {
    this.clearTimer()
    this.timer = window.setTimeout(this.updateFromScheduler, timeout)
    this.setState({ absoluteText, relativeText })
  }

  private updateWithDate(date: Date) {
    const then = moment(date)
    const now = moment()
    const diff = then.diff(now)
    const duration = Math.abs(diff)
    const absoluteText = then.format('LLLL')

    if (diff > 0) {
      this.updateAndSchedule(absoluteText, 'from the future', duration)
    } else if (duration < MINUTE) {
      this.updateAndSchedule(absoluteText, 'just now', MINUTE - duration)
    } else if (duration < HOUR) {
      this.updateAndSchedule(absoluteText, then.from(now), MINUTE)
    } else if (duration < DAY) {
      this.updateAndSchedule(absoluteText, then.from(now), HOUR)
    } else if (duration < 7 * DAY) {
      this.updateAndSchedule(absoluteText, then.from(now), 6 * HOUR)
    } else {
      this.setState({ absoluteText, relativeText: then.format('LL') })
    }
  }

  private updateFromScheduler = () => { this.updateWithDate(this.props.date) }

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

  public render() {
    return (
      <span title={this.state.absoluteText}>{this.state.relativeText}</span>
    )
  }
}
