import * as React from 'react'
import { LinkButton } from '../lib/link-button'
import { Octicon, OcticonSymbol } from '../octicons'
import { Banner } from './banner'

interface IOpenThankYouCardProps {
  readonly onDismissed: () => void
  readonly onOpenCard: () => void
  readonly onThrewCardAway: () => void
}

/**
 * A component which tells the user that there is a thank you card for them.
 */
export class OpenThankYouCard extends React.Component<
  IOpenThankYouCardProps,
  {}
> {
  public render() {
    return (
      <Banner id="open-thank-you-card" onDismissed={this.props.onDismissed}>
        <Octicon className="smiley-icon" symbol={OcticonSymbol.smiley} />

        <span onSubmit={this.props.onOpenCard}>
          The Desktop team would like to thank you for your recent
          contributions.{' '}
          <LinkButton onClick={this.props.onOpenCard}>
            Open Your Card
          </LinkButton>{' '}
          or{' '}
          <LinkButton onClick={this.onThrewCardAway}>Throw It Away</LinkButton>.
        </span>
      </Banner>
    )
  }

  private onThrewCardAway(): void {
    this.props.onDismissed()
    this.props.onThrewCardAway()
  }
}
