import * as React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { Banner } from './banner'
import { LinkButton } from '../lib/link-button'

export class WindowsVersionNoLongerSupportedBanner extends React.Component<{
  onDismissed: () => void
}> {
  public render() {
    return (
      <Banner
        id="conflicts-found-banner"
        dismissable={true}
        onDismissed={this.props.onDismissed}
      >
        <Octicon className="alert-icon" symbol={OcticonSymbol.alert} />
        <div className="banner-message">
          <span>
            This operating system is no longer supported. Software updates have
            been disabled.
          </span>
          <LinkButton uri="https://docs.github.com/en/desktop/installing-and-configuring-github-desktop/overview/supported-operating-systems">
            Support details
          </LinkButton>
        </div>
      </Banner>
    )
  }
}
