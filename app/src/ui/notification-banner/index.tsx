import * as React from 'react'
import { ButtonGroup } from '../lib/button-group';
import { Button } from '../lib/button';
import { Ref } from '../lib/ref';

interface INotificationBannerProps {
}

export class NotificationBanner extends React.Component<INotificationBannerProps, {}> {
  public render() {
    return (<div className="notification-banner diverge-banner">
      <p>
        Your branch is <strong>42 commits</strong> behind <Ref>origin/master</Ref>
      </p>

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
