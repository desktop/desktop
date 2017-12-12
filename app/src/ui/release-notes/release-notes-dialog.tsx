import * as React from 'react'

import {
  getChangeLog,
  getReleaseSummary,
  ReleaseSummary,
  ReleaseEntry,
} from '../../lib/release-notes'

import { updateStore } from '../lib/update-store'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Loading } from '../lib/loading'

import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IReleaseNotesProps {
  readonly onDismissed: () => void
  readonly currentVersion: string
}

interface IReleaseNotesState {
  readonly loading: boolean
  readonly error?: Error
  readonly releaseSummary?: ReleaseSummary
}

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function getPrefix(day: number) {
  const remainder = day % 10
  if (remainder === 1) {
    return 'st'
  } else if (remainder === 2) {
    return 'nd'
  } else if (remainder === 3) {
    return 'rd'
  } else {
    return 'th'
  }
}

function formatDate(date: Date) {
  const day = date.getDate()
  const prefix = getPrefix(day)
  const monthIndex = date.getMonth()
  const year = date.getFullYear()

  return `${monthNames[monthIndex]} ${day}${prefix} ${year}`
}

/**
 * The dialog to show with details about the newest release
 */
export class ReleaseNotes extends React.Component<
  IReleaseNotesProps,
  IReleaseNotesState
> {
  public constructor(props: IReleaseNotesProps) {
    super(props)

    this.state = { loading: true }
  }

  public async componentDidMount() {
    const currentVersion = this.props.currentVersion

    try {
      const releases = await getChangeLog()
      const releaseSummary = getReleaseSummary(currentVersion, releases)

      this.setState({ releaseSummary })
    } catch {
      // TODO: handle error about network
    } finally {
      this.setState({ loading: false })
    }
  }

  private renderList(
    releaseEntries: ReadonlyArray<ReleaseEntry>,
    header: string
  ): JSX.Element | null {
    if (releaseEntries.length === 0) {
      return null
    }

    const options = new Array<JSX.Element>()

    for (const entry of releaseEntries) {
      options.push(<li>{entry.message}</li>)
    }

    return (
      <div>
        <p>{header}</p>
        <ul>{options}</ul>
      </div>
    )
  }

  private showReleaseContents(releaseSummary: ReleaseSummary) {
    return (
      <DialogContent>
        <div className="header">
          <p>Version {releaseSummary.latestVersion}</p>
          <p>{formatDate(releaseSummary.datePublished)}</p>
        </div>

        {this.renderList(releaseSummary.bugfixes, 'Bugfixes')}
        {this.renderList(releaseSummary.enhancements, 'Enhancements')}
        {this.renderList(releaseSummary.other, 'Other')}
      </DialogContent>
    )
  }

  private showLoadingIndicator() {
    return (
      <DialogContent>
        <Loading />
      </DialogContent>
    )
  }

  public render() {
    // TODO: what to show if an error occurs
    const content = this.state.releaseSummary
      ? this.showReleaseContents(this.state.releaseSummary)
      : this.showLoadingIndicator()

    return (
      <Dialog id="release-notes" onDismissed={this.props.onDismissed}>
        {content}
        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button type="submit">Close</Button>
            <Button onClick={this.updateNow}>
              {__DARWIN__ ? 'Install Now' : 'Install now'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private updateNow = () => {
    updateStore.quitAndInstallUpdate()
  }
}
