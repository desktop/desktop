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

import { RichText } from '../lib/rich-text'
import { Repository } from '../../models/repository'
import { getDotComAPIEndpoint } from '../../lib/api'
import { shell } from '../../lib/app-shell'
import { ReleaseNotesUri } from '../lib/releases'

// HACK: This is needed because the `Rich`Text` component
// needs to know what repo to link issues against.
// Since release notes are Desktop specific, we can't
// reley on the repo info we keep in state, so we've
// stubbed out this repo
const repository = new Repository(
  '',
  -1,
  {
    dbID: null,
    name: 'desktop',
    owner: {
      id: null,
      login: 'desktop',
      endpoint: getDotComAPIEndpoint(),
      hash: '',
    },
    private: false,
    parent: null,
    htmlURL: 'https://github.com/desktop/desktop',
    defaultBranch: 'master',
    cloneURL: 'https://github.com/desktop/desktop',
    endpoint: getDotComAPIEndpoint(),
    fullName: 'desktop/desktop',
    fork: false,
    hash: '',
  },
  true
)

const ReleaseNoteHeaderLeftUri = encodePathAsUrl(
  __dirname,
  'static/release-note-header-left.svg'
)
const ReleaseNoteHeaderRightUri = encodePathAsUrl(
  __dirname,
  'static/release-note-header-right.svg'
)

interface IReleaseNotesProps {
  readonly onDismissed: () => void
  readonly emoji: Map<string, string>
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
      options.push(
        <li key={i}>
          <RichText
            text={entry.message}
            emoji={this.props.emoji}
            renderUrlsAsLinks={true}
            repository={repository}
          />
        </li>
      )
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
        <div className="column">
          {this.renderList(release.bugfixes, 'Bugfixes')}
          {this.renderList(release.enhancements, 'Enhancements')}
          {this.renderList(release.other, 'Other')}
        </div>
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
    const release = this.props.newRelease

    const contents =
      release.enhancements.length > 0 && release.bugfixes.length > 0
        ? this.drawTwoColumnLayout(release)
        : this.drawSingleColumnLayout(release)

    const dialogHeader = (
      <DialogHeader title={` `} dismissable={false}>
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
    )

    return (
      <Dialog
        id="release-notes"
        onDismissed={this.props.onDismissed}
        title={dialogHeader}
      >
        <DialogContent>{contents}</DialogContent>
        <DialogFooter>
          <LinkButton onClick={this.showAllReleaseNotes}>
            View all release notes
          </LinkButton>
          <ButtonGroup destructive={true}>
            <Button type="submit">Close</Button>
            <Button onClick={this.updateNow}>
              {__DARWIN__ ? 'Install and Restart' : 'Install and restart'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private updateNow = () => {
    updateStore.quitAndInstallUpdate()
  }

  private showAllReleaseNotes = () => {
    shell.openExternal(ReleaseNotesUri)
  }
}
