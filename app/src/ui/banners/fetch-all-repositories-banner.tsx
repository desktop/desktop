import * as React from 'react'
import { Banner } from './banner'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IFetchAllRepositoriesBannerProps {
  readonly message: string
  readonly onDismissed: () => void
}

/**
 * Shown when one or more repositories could not be fetched. Stays until the
 * user dismisses it so the summary can be read.
 */
export class FetchAllRepositoriesBanner extends React.Component<IFetchAllRepositoriesBannerProps> {
  public render() {
    return (
      <Banner id="fetch-all-repositories" onDismissed={this.props.onDismissed}>
        <Octicon className="alert-icon" symbol={octicons.alert} />
        <div className="banner-message">
          <span>{this.props.message}</span>
        </div>
      </Banner>
    )
  }
}
