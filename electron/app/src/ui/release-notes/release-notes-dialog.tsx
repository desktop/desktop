import * as React from 'react'
import { ReleaseNote, ReleaseSummary } from '../../models/release-notes'
import { updateStore } from '../lib/update-store'
import { LinkButton } from '../lib/link-button'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { RichText } from '../lib/rich-text'
import { shell } from '../../lib/app-shell'
import { ReleaseNotesUri } from '../lib/releases'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { DesktopFakeRepository } from '../../lib/desktop-fake-repository'
import { SandboxedMarkdown } from '../lib/sandboxed-markdown'
import { Button } from '../lib/button'
import { Emoji } from '../../lib/emoji'

interface IReleaseNotesProps {
  readonly onDismissed: () => void
  readonly emoji: Map<string, Emoji>
  readonly newReleases: ReadonlyArray<ReleaseSummary>
  readonly underlineLinks: boolean
}

/**
 * The dialog to show with details about the newest release
 */
export class ReleaseNotes extends React.Component<IReleaseNotesProps, {}> {
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
            repository={DesktopFakeRepository}
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

  /**
   * If there is just one release, it returns it. If multiple, it merges the release notes.
   */
  private getDisplayRelease = () => {
    const { newReleases } = this.props

    const latestRelease = newReleases.at(0)
    const oldestRelease = newReleases.at(-1)

    if (
      latestRelease === undefined ||
      oldestRelease === undefined ||
      latestRelease === oldestRelease
    ) {
      return latestRelease
    }

    return {
      latestVersion: `${oldestRelease.latestVersion} - ${latestRelease.latestVersion}`,
      datePublished: `${oldestRelease.datePublished} to ${latestRelease.datePublished}`,
      enhancements: newReleases.flatMap(r => r.enhancements),
      bugfixes: newReleases.flatMap(r => r.bugfixes),
      pretext: newReleases.flatMap(r => r.pretext),
      other: [],
      thankYous: [],
    }
  }

  private renderPretext = (pretext: ReadonlyArray<ReleaseNote>) => {
    if (pretext.length === 0) {
      return
    }

    return (
      <SandboxedMarkdown
        markdown={pretext[0].message}
        emoji={this.props.emoji}
        onMarkdownLinkClicked={this.onMarkdownLinkClicked}
        underlineLinks={this.props.underlineLinks}
        ariaLabel="Release notes generated from markdown"
      />
    )
  }

  private onDismissed = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.props.onDismissed()
  }

  private renderButtons = () => {
    const latestVersion = this.props.newReleases[0].latestVersion
    if (latestVersion === __APP_VERSION__) {
      return (
        <Button type="submit" onClick={this.onDismissed}>
          Close
        </Button>
      )
    }

    return (
      <OkCancelButtonGroup
        destructive={true}
        okButtonText={
          __DARWIN__ ? 'Install and Restart' : 'Install and restart'
        }
        cancelButtonText="Close"
      />
    )
  }

  public render() {
    const release = this.getDisplayRelease()

    if (release === undefined) {
      return null
    }

    const { latestVersion, datePublished, enhancements, bugfixes, pretext } =
      release

    const contents =
      enhancements.length > 0 && bugfixes.length > 0
        ? this.drawTwoColumnLayout(release)
        : this.drawSingleColumnLayout(release)

    const dialogHeader = (
      <>
        <span className="version">Version {latestVersion}</span>
        <span className="date">{datePublished}</span>
      </>
    )

    return (
      <Dialog
        id="release-notes"
        onDismissed={this.props.onDismissed}
        onSubmit={this.updateNow}
        title={dialogHeader}
      >
        <DialogContent>
          {this.renderPretext(pretext)}
          {contents}
        </DialogContent>
        <DialogFooter>
          <LinkButton onClick={this.showAllReleaseNotes}>
            View all release notes
          </LinkButton>
          {this.renderButtons()}
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

  private onMarkdownLinkClicked = (url: string) => {
    shell.openExternal(url)
  }
}
