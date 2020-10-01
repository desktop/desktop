import * as React from 'react'
import { Dispatcher } from '../dispatcher/index'
import { LinkButton } from '../lib/link-button'
import { updateStore } from '../lib/update-store'
import { Octicon, OcticonSymbol } from '../octicons'
import { PopupType } from '../../models/popup'
import { shell } from '../../lib/app-shell'

import { ReleaseSummary } from '../../models/release-notes'
import { Banner } from './banner'
import { ReleaseNotesUri } from '../lib/releases'

interface IUpdateAvailableProps {
  readonly dispatcher: Dispatcher
  readonly newRelease: ReleaseSummary | null
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
      <Banner id="update-available" onDismissed={this.props.onDismissed}>
        <Octicon
          className="download-icon"
          symbol={OcticonSymbol.desktopDownload}
        />

        <span onSubmit={this.updateNow}>
          An updated version of GitHub Desktop is available and will be
          installed at the next launch. See{' '}
          <LinkButton onClick={this.showReleaseNotes}>what's new</LinkButton> or{' '}
          <LinkButton onClick={this.updateNow}>
            restart GitHub Desktop
          </LinkButton>
          .
        </span>
      </Banner>
    )
  }

  private showReleaseNotes = () => {
    if (this.props.newRelease == null) {
      // if, for some reason we're not able to render the release notes we
      // should redirect the user to the website so we do _something_
      shell.openExternal(ReleaseNotesUri)
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
}
