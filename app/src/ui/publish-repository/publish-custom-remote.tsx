import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
// import { Account } from '../../models/account'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
// import { Repository } from '../../models/repository'

interface IPublishCustomRemoteProps {
  /** The user to use for publishing. */
  //readonly account: Account

  /** The function called when user clicks cancel button */
  readonly onDismissed: () => void

  // readonly repository: Repository
}

interface IPublishCustomRemoteState {
  readonly disabled: boolean
  readonly remoteURL: string
}

export class PublishCustomRemote extends React.Component<
  IPublishCustomRemoteProps,
  IPublishCustomRemoteState
> {
  public constructor(props: IPublishCustomRemoteProps) {
    super(props)

    this.state = {
      disabled: false,
      remoteURL: '',
    }
  }

  public render() {
    return (
      <Dialog
        id="publish-custom-remote"
        title={
          __DARWIN__ ? 'Publish to Custom Remote' : 'Publish to custom remote'
        }
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        disabled={this.state.disabled}
      >
        <DialogContent>
          <Row>
            <TextBox
              label="Primary remote repository (origin) URL"
              placeholder="https://github.com/example-org/repo-name.git"
              value={this.state.remoteURL}
              autoFocus={true}
              onChange={this.onURLChanged}
            />
          </Row>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" onClick={this.onSubmit}>
              {'Save & Publish'}
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = () => {}

  private onURLChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ remoteURL: event.currentTarget.value })
  }
}
