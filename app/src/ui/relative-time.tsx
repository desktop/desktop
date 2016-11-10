import * as React from 'react'
import * as moment from 'moment'

interface IRelativeTimeProps {
  readonly date: Date
}

interface IRelativeTimeState {
  readonly text: string
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

  private update = () => {
    this.clearTimer()

    const then = moment(this.props.date)
    const now = moment()
    const diff = then.diff(now)
    const duration = Math.abs(diff)

    if (diff > 0) {
      this.timer = window.setTimeout(this.update, duration)
      this.setState({ text: 'from the future' })
    } else if (duration < MINUTE) {
      this.timer = window.setTimeout(this.update, MINUTE - duration)
      this.setState({ text: 'just now' })
    } else if (duration < HOUR) {
      this.timer = window.setTimeout(this.update, MINUTE)
      this.setState({ text: then.from(now) })
    } else if (duration < DAY) {
      this.timer = window.setTimeout(this.update, HOUR)
      this.setState({ text: then.from(now) })
    } else if (duration < 7 * DAY) {
      this.timer = window.setTimeout(this.update, 6 * HOUR)
      this.setState({ text: then.from(now) })
    } else {
      this.setState({ text: then.format('LL') })
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
      <span>{this.state.text}</span>
    )
  }
}
