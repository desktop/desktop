import * as React from 'react'
import { getTeamGreeting } from '../../lib/team-links'

const timeFormat = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const weekdayFormat = new Intl.DateTimeFormat('ja-JP', { weekday: 'long' })

/** Format a date like "9月30日 水曜日" */
export const formatHomeDate = (date: Date) =>
  `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayFormat.format(date)}`

/** Format a time like "09:05" */
export const formatHomeTime = (date: Date) => timeFormat.format(date)

interface IHomeHeaderState {
  readonly time: string
  readonly date: string
  readonly greeting: string
}

function getState(now: Date = new Date()): IHomeHeaderState {
  return {
    time: formatHomeTime(now),
    date: formatHomeDate(now),
    greeting: getTeamGreeting(now),
  }
}

/**
 * A lock screen style header with the current time, date and a greeting,
 * shown when the repository has no local changes.
 */
export class HomeHeader extends React.Component<{}, IHomeHeaderState> {
  private timer: number | null = null

  public constructor(props: {}) {
    super(props)
    this.state = getState()
  }

  public componentDidMount() {
    this.timer = window.setInterval(this.tick, 1000)
  }

  public componentWillUnmount() {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
    }
  }

  private tick = () => {
    const next = getState()
    if (
      next.time !== this.state.time ||
      next.date !== this.state.date ||
      next.greeting !== this.state.greeting
    ) {
      this.setState(next)
    }
  }

  public render() {
    const { time, date, greeting } = this.state

    return (
      <div className="ms-home-header">
        <div className="ms-home-date">{date}</div>
        <div className="ms-home-time" aria-hidden="true">
          {time}
        </div>
        <h1 className="ms-home-greeting">{greeting}</h1>
        <p className="ms-home-subtitle">
          未コミットの変更はありません。次にできることはこちらです。
        </p>
      </div>
    )
  }
}
