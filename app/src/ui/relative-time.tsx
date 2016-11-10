import * as React from 'react'
import * as moment from 'moment'

interface IRelativeTimeProps {
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

export class RelativeTime extends React.Component<IRelativeTimeProps, IRelativeTimeState> {

  private timer: number | null

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private updateAndSchedule(absoluteText: string, relativeText: string, timeout: number) {
    this.timer = window.setTimeout(this.update, timeout)
    this.setState({ absoluteText, relativeText })
  }

  private update = () => {
    this.clearTimer()

    const then = moment(this.props.date)
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

  public componentWillReceiveProps(nextProps: IRelativeTimeProps) {
    if (this.props.date !== nextProps.date) {
      this.update()
    }
  }

  public componentWillMount() {
    this.update()
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
