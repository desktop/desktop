import * as React from 'react'
import { ButtonGroup } from '../lib/button-group';
import { Button } from '../lib/button';
import { Ref } from '../lib/ref';

interface INotificationBannerProps {
}

export class NotificationBanner extends React.Component<INotificationBannerProps, {}> {
  public render() {
    return (<div className="notification-banner">
      <p>
        Your branch is <strong>42 commits</strong> behind <Ref>origin/master</Ref>
      </p>

      <ButtonGroup>
        <Button type="submit" onClick={this.noop}>
          Compare
        </Button>

        <Button onClick={this.noop}>
          Merge...
        </Button>
      </ButtonGroup>
    </div>)
  }

  private noop = () => {}
}
