import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { updateStore } from '../lib/update-store'
import { Octicon, OcticonSymbol } from '../octicons'

interface IUpdateAvailableProps {
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
          <LinkButton uri={this.props.releaseNotesLink}>what's new</LinkButton>{' '}
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

  private updateNow = () => {
    updateStore.quitAndInstallUpdate()
  }

  private dismiss = () => {
    this.props.onDismissed()
  }
}
