import * as React from 'react'
import { TooltippedContent } from './lib/tooltipped-content'
import { formatDate } from '../lib/format-date'
import { formatRelative } from '../lib/format-relative'

interface IRelativeTimeProps {
  /**
   * The date instance that will be used for calculating
   * the relative time elapsed
   */
  readonly date: Date

  /**
   * By default the RelativeTime component will start displaying a compact
   * absolute date if the date is more than one week ago. Setting `onlyRelative`
   * to true overrides this behavior and forces relative times for all dates.
   */
  readonly onlyRelative?: boolean

  readonly className?: string
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

type RelativeTimeInfo = {
  absoluteText: string
  relativeText: string
  duration?: number
}

export function getRelativeTimeInfoFromDate(
  then: Date,
  onlyRelative: boolean = true
): RelativeTimeInfo {
  const diff = then.getTime() - Date.now()
  const duration = Math.abs(diff)

  const absoluteText = formatDate(then, {
    dateStyle: 'full',
    timeStyle: 'short',
  })

  const relativeText = formatRelative(diff)

  // Future date, let's just show as absolute and reschedule. If it's less
  // than a minute into the future we'll treat it as 'just now'.
  if (diff > 0 && duration > MINUTE) {
    return {
      absoluteText,
      relativeText: formatDate(then, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      duration,
    }
  } else if (duration < MINUTE) {
    return {
      absoluteText,
      relativeText: 'just now',
      duration: MINUTE - duration,
    }
  } else if (duration < HOUR) {
    return { absoluteText, relativeText, duration: MINUTE }
  } else if (duration < DAY) {
    return { absoluteText, relativeText, duration: HOUR }
  } else if (duration < 7 * DAY) {
    return { absoluteText, relativeText, duration: 6 * HOUR }
  } else {
    if (onlyRelative) {
      return { absoluteText, relativeText, duration: 6 * HOUR }
    } else {
      // More than a week ago, just the date will suffice
      return {
        absoluteText,
        relativeText: formatDate(then, { dateStyle: 'medium' }),
      }
    }
  }
}

/**
 * An auto-updating component rendering a relative time in human readable form.
 *
 * Example: 'just now', '4 minutes ago', '3 days ago'.
 * or if abbreviated: 'just now', '4m', '3d'.
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

  private updateWithDate(then: Date) {
    const { onlyRelative } = this.props

    const { absoluteText, relativeText, duration } =
      getRelativeTimeInfoFromDate(then, onlyRelative)

    if (duration !== undefined) {
      this.updateAndSchedule(absoluteText, relativeText, duration)
    } else {
      this.setState({ absoluteText, relativeText })
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
      <TooltippedContent
        className={this.props.className}
        tooltip={this.state.absoluteText}
      >
        {this.state.relativeText}
      </TooltippedContent>
    )
  }
}
