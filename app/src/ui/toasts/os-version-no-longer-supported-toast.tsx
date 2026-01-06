import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { ToastNotification } from './toast-notification'
import { LinkButton } from '../lib/link-button'
import { setNumber } from '../../lib/local-storage'

export const UnsupportedOSToastDismissedAtKey =
  'unsupported-os-toast-dismissed-at'

export class OSVersionNoLongerSupportedToast extends React.Component<{
  onDismissed: () => void
}> {
  private onDismissed = () => {
    setNumber(UnsupportedOSToastDismissedAtKey, Date.now())
    this.props.onDismissed()
  }

  public render() {
    return (
      <ToastNotification
        id="os-not-supported-toast"
        dismissable={true}
        onDismissed={this.onDismissed}
      >
        <Octicon className="alert-icon" symbol={octicons.alert} />
        This operating system is no longer supported. Software updates have been
        disabled.
        <LinkButton uri="https://docs.github.com/en/desktop/installing-and-configuring-github-desktop/overview/supported-operating-systems">
          Support details
        </LinkButton>
      </ToastNotification>
    )
  }
}
