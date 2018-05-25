import * as React from 'react'
import { ButtonGroup } from '../lib/button-group';
import { Button } from '../lib/button';
import { Ref } from '../lib/ref';
import { Octicon, OcticonSymbol } from '../octicons';

interface INotificationBannerProps {
}

export class NotificationBanner extends React.Component<INotificationBannerProps, {}> {
  public render() {
    return (<div className="notification-banner diverge-banner">
      <div className="notification-banner-content">
        <p>
          Your branch is <strong>42 commits</strong> behind <Ref>origin/master</Ref>
        </p>

        <a className="close" aria-label="Dismiss banner">
          <Octicon symbol={OcticonSymbol.x} />
        </a>
      </div>

      <ButtonGroup>
        <Button type="submit" onClick={this.noop}>
          Merge...
        </Button>

        <Button onClick={this.noop}>
          Compare
        </Button>
      </ButtonGroup>
    </div>)
  }

  private noop = () => {}
}
