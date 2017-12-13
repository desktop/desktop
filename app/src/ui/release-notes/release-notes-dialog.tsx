import * as React from 'react'

import { generateReleaseSummary } from '../../lib/release-notes'
import { Octicon, OcticonSymbol } from '../octicons'

import { ReleaseNote, ReleaseSummary } from '../../models/release-notes'

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
      const releaseSummary = await generateReleaseSummary(currentVersion)
      this.setState({ releaseSummary })
    } catch {
      // TODO: handle error about network
    } finally {
      this.setState({ loading: false })
    }
  }

  private onCloseButtonClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (this.props.onDismissed) {
      this.props.onDismissed()
    }
  }

  private renderCloseButton() {
    // We're intentionally using <a> here instead of <button> because
    // we can't prevent chromium from giving it focus when the the dialog
    // appears. Setting tabindex to -1 doesn't work. This might be a bug,
    // I don't know and we may want to revisit it at some point but for
    // now an anchor will have to do.
    return (
      <a className="close" onClick={this.onCloseButtonClick}>
        <Octicon symbol={OcticonSymbol.x} />
      </a>
    )
  }

  private renderList(
    releaseEntries: ReadonlyArray<ReleaseNote>,
    header: string
  ): JSX.Element | null {
    if (releaseEntries.length === 0) {
      return null
    }

    const options = new Array<JSX.Element>()

    for (const [i, entry] of releaseEntries.entries()) {
      options.push(<li key={i}>{entry.message}</li>)
    }

    return (
      <div className="section">
        <p className="header">{header}</p>
        <ul className="entries">{options}</ul>
      </div>
    )
  }

  private showReleaseContents(releaseSummary: ReleaseSummary) {
    // TODO: how to split layout
    return (
      <DialogContent>
        <header className="dialog-header">
          <div className="title">
            <p className="version">Version {releaseSummary.latestVersion}</p>
            <p className="date">{formatDate(releaseSummary.datePublished)}</p>
          </div>
          {this.renderCloseButton()}
        </header>

        <div className="column">
          {this.renderList(releaseSummary.bugfixes, 'Bugfixes')}
          {this.renderList(releaseSummary.enhancements, 'Enhancements')}
          {this.renderList(releaseSummary.other, 'Other')}
        </div>
      </DialogContent>
    )
  }

  private showLoadingIndicator() {
    return (
      <DialogContent>
        <header className="dialog-header">
          <div className="title">
            <p className="version" />
            <p className="date" />
          </div>
          {this.renderCloseButton()}
        </header>
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
