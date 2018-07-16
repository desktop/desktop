import * as React from 'react'

import { Octicon, OcticonSymbol } from '../octicons'
import { encodePathAsUrl } from '../../lib/path'

import { ReleaseNote, ReleaseSummary } from '../../models/release-notes'

import { updateStore } from '../lib/update-store'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { LinkButton } from '../lib/link-button'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { DialogHeader } from '../dialog/header'

const ReleaseNoteHeaderLeftUri = encodePathAsUrl(
  __dirname,
  'static/release-note-header-left.svg'
)
const ReleaseNoteHeaderRightUri = encodePathAsUrl(
  __dirname,
  'static/release-note-header-right.svg'
)

const externalContributionRe = /^(.*)(#\d+)(.*)(@[a-zA-Z0-9\-]+)!(.*)$/
const otherContributionRe = /^(.*)(#\d+)(.*)$/

function desktopIssueUrl(numberWithHash: string): string {
  return `https://github.com/desktop/desktop/issues/${numberWithHash.substr(1)}`
}

function accountUrl(name: string): string {
  return `https://github.com/${name.substr(1)}`
}

function renderLineItem(note: string): (JSX.Element | string)[] | string {
  const externalContribution = externalContributionRe.exec(note)
  if (externalContribution) {
    const issueNumber = externalContribution[2]
    const issueUrl = desktopIssueUrl(issueNumber)
    const mention = externalContribution[4]
    const mentionUrl = accountUrl(issueNumber)

    return [
      externalContribution[1],
      <LinkButton key={2} uri={issueUrl}>
        {issueNumber}
      </LinkButton>,
      externalContribution[3],
      <LinkButton key={4} uri={mentionUrl}>
        {mention}
      </LinkButton>,
      externalContribution[5],
    ]
  }

  const otherContribution = otherContributionRe.exec(note)
  if (otherContribution) {
    const issueNumber = otherContribution[2]
    const issueUrl = desktopIssueUrl(issueNumber)

    return [
      otherContribution[1],
      <LinkButton key={2} uri={issueUrl}>
        {issueNumber}
      </LinkButton>,
      otherContribution[3],
    ]
  }

  return note
}

/**
 * This is only used for testing
 *
 * TODO: Delete this
 */
const releaseSummaryStub: ReleaseSummary = {
  latestVersion: 'Test',
  datePublished: 'July 11, 2018',
  pretext: 'All kindz of pretext',
  enhancements: [
    {
      kind: 'improved',
      message: 'Improvement 1',
    },
    {
      kind: 'improved',
      message: 'Improvement 2',
    },
    {
      kind: 'improved',
      message: 'Improvement 3',
    },
    {
      kind: 'improved',
      message: 'Improvement 4',
    },
    {
      kind: 'improved',
      message: 'Improvement 5',
    },
    {
      kind: 'improved',
      message: 'Improvement 6',
    },
    {
      kind: 'improved',
      message: 'Improvement 7',
    },
  ],
  bugfixes: [
    {
      kind: 'fixed',
      message: 'Fix 1',
    },
    {
      kind: 'fixed',
      message: 'Fix 2',
    },
    {
      kind: 'fixed',
      message: 'Fix 3',
    },
  ],
  other: [],
}

interface IReleaseNotesProps {
  readonly onDismissed: () => void
  readonly newRelease: ReleaseSummary
}

/**
 * The dialog to show with details about the newest release
 */
export class ReleaseNotes extends React.Component<IReleaseNotesProps, {}> {
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
      options.push(<li key={i}>{renderLineItem(entry.message)}</li>)
    }

    return (
      <div className="section">
        <p className="header">
          <strong>{header}</strong>
        </p>
        <ul className="entries">{options}</ul>
      </div>
    )
  }

  private drawSingleColumnLayout(release: ReleaseSummary): JSX.Element {
    return (
      <div className="container">
        {this.renderList(release.bugfixes, 'Bugfixes')}
        {this.renderList(release.enhancements, 'Enhancements')}
        {this.renderList(release.other, 'Other')}
      </div>
    )
  }

  private drawTwoColumnLayout(release: ReleaseSummary): JSX.Element {
    return (
      <div className="container">
        <div className="column">
          {this.renderList(release.enhancements, 'Enhancements')}
          {this.renderList(release.other, 'Other')}
        </div>
        <div className="column">
          {this.renderList(release.bugfixes, 'Bugfixes')}
        </div>
      </div>
    )
  }

  public render() {
    const release = releaseSummaryStub || this.props.newRelease

    const contents =
      release.enhancements.length > 0 && release.bugfixes.length > 0
        ? this.drawTwoColumnLayout(release)
        : this.drawSingleColumnLayout(release)

    return (
      <Dialog id="release-notes" onDismissed={this.props.onDismissed}>
        <DialogHeader
          title={` `}
          dismissable={false}
        >
          <div className="release-notes-header">
            <img
              className="release-note-graphic-left"
              src={ReleaseNoteHeaderLeftUri}
            />
            <div className="title">
              <p className="version">Version {release.latestVersion}</p>
              <p className="date">{release.datePublished}</p>
            </div>
            <img
              className="release-note-graphic-right"
              src={ReleaseNoteHeaderRightUri}
            />
            {this.renderCloseButton()}
          </div>
        </DialogHeader>

        <DialogContent>{contents}</DialogContent>
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
