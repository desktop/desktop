import * as React from 'react'
import { desktopRepository } from '../../lib/desktop-repo'
import { ReleaseNote } from '../../models/release-notes'
import { Dialog, DialogContent } from '../dialog'
import { RichText } from '../lib/rich-text'
import {
  ReleaseNoteHeaderLeftUri,
  ReleaseNoteHeaderRightUri,
} from '../release-notes/release-notes-dialog'

interface IThankYouProps {
  readonly onDismissed: () => void
  readonly emoji: Map<string, string>
  readonly userContributions: ReadonlyArray<ReleaseNote>
  readonly friendlyName: string
  readonly latestVersion: string | null
}

export class ThankYou extends React.Component<IThankYouProps, {}> {
  private renderList(
    releaseEntries: ReadonlyArray<ReleaseNote>
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
            repository={desktopRepository}
          />
        </li>
      )
    }

    return (
      <div className="section">
        <ul className="entries">{options}</ul>
      </div>
    )
  }

  private renderConfetti(): JSX.Element | null {
    const confetti = new Array<JSX.Element>()

    const howMuchConfetti = 1500
    for (let i = 0; i < howMuchConfetti; i++) {
      confetti.push(<div key={i} className="confetti"></div>)
    }

    return <>{confetti}</>
  }

  public render() {
    const dialogHeader = (
      <div className="release-notes-header">
        <div className="header-graphics">
          <img
            className="release-note-graphic-left"
            src={ReleaseNoteHeaderLeftUri}
          />
          <div className="img-space"></div>
          <img
            className="release-note-graphic-right"
            src={ReleaseNoteHeaderRightUri}
          />
        </div>
        <div className="title">
          <div className="thank-you">
            Thank you {this.props.friendlyName}!{' '}
            <RichText
              text={':tada:'}
              emoji={this.props.emoji}
              renderUrlsAsLinks={true}
              repository={desktopRepository}
            />
          </div>
          <div className="thank-you-note">
            The Desktop team wants to thank you personally.
          </div>
        </div>
      </div>
    )

    const thankYou = 'Thank you for all your hard work on GitHub Desktop'
    let thankYouNote
    if (this.props.latestVersion === null) {
      thankYouNote = <>{thankYou}</>
    } else {
      thankYouNote = (
        <>
          {thankYou} version {this.props.latestVersion}
        </>
      )
    }

    return (
      <Dialog
        id="thank-you-notes"
        onDismissed={this.props.onDismissed}
        title={dialogHeader}
      >
        <DialogContent>
          <div className="container">
            <div className="thank-you-note">{thankYouNote}.</div>
            <div className="contributions-heading">You contributed:</div>
            <div className="contributions">
              {this.renderList(this.props.userContributions)}
            </div>
            <div
              className="confetti-container"
              onClick={this.props.onDismissed}
            >
              {this.renderConfetti()}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
}
