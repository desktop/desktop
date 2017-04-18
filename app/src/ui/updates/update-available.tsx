import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Dispatcher } from '../../lib/dispatcher'
import { updateStore } from '../lib/update-store'
import { Octicon, OcticonSymbol } from '../octicons'

interface IUpdateAvailableProps {
  readonly dispatcher: Dispatcher
}

/**
 * A component which tells the user an update is available and gives them the
 * option of moving into the future or being a luddite.
 */
export class UpdateAvailable extends React.Component<IUpdateAvailableProps, void> {
  public render() {
    return (
      <div
        id='update-available'
        onSubmit={this.updateNow}
      >
        <Octicon symbol={OcticonSymbol.desktopDownload} />

        <span>
          An updated version of GitHub Desktop is avalble and will be installed at the next launch. See what's new or <LinkButton onClick={this.updateNow}>restart now </LinkButton>.
        </span>

        <a
          className='close'
          onClick={this.dismiss}>
          <Octicon symbol={OcticonSymbol.x} />
        </a>
      </div>
    )
  }

  private updateNow = () => {
    updateStore.quitAndInstallUpdate()
  }

  private dismiss = () => {
    this.props.dispatcher.closePopup()
  }
}
