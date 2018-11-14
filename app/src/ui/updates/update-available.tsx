import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher/index'
import { LinkButton } from '../lib/link-button'
import { updateStore } from '../lib/update-store'
import { Octicon, OcticonSymbol } from '../octicons'
import { PopupType } from '../../models/popup'
import { shell } from '../../lib/app-shell'

import { ReleaseSummary } from '../../models/release-notes'
import { enableInAppReleaseNotes } from '../../lib/feature-flag'

interface IUpdateAvailableProps {
  readonly dispatcher: Dispatcher
  readonly newRelease: ReleaseSummary | null
  readonly releaseNotesLink: string
  readonly onDismissed: () => void
}

/**
 * A component which tells the user an update is available and gives them the
 * option of moving into the future or being a luddite.
 */
export class UpdateAvailable extends React.Component<
  IUpdateAvailableProps,
  {}
> {
  public render() {
    return (
      <div id="update-available" className="active" onSubmit={this.updateNow}>
        <Octicon className="icon" symbol={OcticonSymbol.desktopDownload} />

        <span>
          An updated version of GitHub Desktop is available and will be
          installed at the next launch. See{' '}
          {enableInAppReleaseNotes() ? (
            <LinkButton onClick={this.showReleaseNotes}>what's new</LinkButton>
          ) : (
            <LinkButton uri={this.props.releaseNotesLink}>
              what's new
            </LinkButton>
          )}{' '}
          or{' '}
          <LinkButton onClick={this.updateNow}>
            restart GitHub Desktop
          </LinkButton>
          .
        </span>

        <a className="close" onClick={this.dismiss}>
          <Octicon symbol={OcticonSymbol.x} />
        </a>
      </div>
    )
  }

  private showReleaseNotes = () => {
    if (this.props.newRelease == null) {
      // if, for some reason we're not able to render the release notes we
      // should redirect the user to the website so we do _something_
      const releaseNotesUri = 'https://desktop.github.com/release-notes/'
      shell.openExternal(releaseNotesUri)
    } else {
      this.props.dispatcher.showPopup({
        type: PopupType.ReleaseNotes,
        newRelease: this.props.newRelease,
      })
    }
  }

  private updateNow = () => {
    updateStore.quitAndInstallUpdate()
  }

  private dismiss = () => {
    this.props.onDismissed()
  }
}
