import * as React from 'react'

import { encodePathAsUrl } from '../../lib/path'

import { ReleaseNote } from '../../models/release-notes'

import { Dialog, DialogContent } from '../dialog'

import { RichText } from '../lib/rich-text'
import { Repository } from '../../models/repository'
import { getDotComAPIEndpoint } from '../../lib/api'
import { GitHubRepository } from '../../models/github-repository'
import { Owner } from '../../models/owner'

// HACK: This is needed because the `Rich`Text` component
// needs to know what repo to link issues against.
// Since release notes are Desktop specific, we can't
// rely on the repo info we keep in state, so we've
// stubbed out this repo
const desktopOwner = new Owner('desktop', getDotComAPIEndpoint(), -1)
const desktopUrl = 'https://github.com/desktop/desktop'
const desktopRepository = new Repository(
  '',
  -1,
  new GitHubRepository('desktop', desktopOwner, -1, false, desktopUrl),
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

interface IThankYouProps {
  readonly onDismissed: () => void
  readonly emoji: Map<string, string>
  readonly userContributions: ReadonlyArray<ReleaseNote>
  readonly friendlyName: string
  readonly latestVersion: string
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

    return (
      <Dialog
        id="thank-you-notes"
        onDismissed={this.props.onDismissed}
        title={dialogHeader}
      >
        <DialogContent>
          <div className="container">
            <div className="thank-you-note">
              Thank you for all your hard work on GitHub Desktop version{' '}
              {this.props.latestVersion}.
            </div>
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
