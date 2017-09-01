import * as React from 'react'
import { Dialog, DialogContent, DialogFooter, DialogError } from '../dialog'
// import { Account } from '../../models/account'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { Dispatcher } from '../../lib/dispatcher/dispatcher'
import { PopupType } from '../../lib/app-state'
import { Repository } from '../../models/repository'

interface IPublishCustomRemoteProps {
  /** The user to use for publishing. */
  //readonly account: Account

  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly onDismissed: () => void
}

interface IPublishCustomRemoteState {
  readonly disabled: boolean
  readonly remoteURL: string
  readonly errors?: ReadonlyArray<JSX.Element | string>
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
        {this.renderErrors()}
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
            <Button onClick={this.onCancel}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    this.setState({ disabled: true, errors: undefined })
    const errors = new Array<JSX.Element | string>()

    try {
      this.props.dispatcher.publishRepository(
        this.props.repository,
        this.state.remoteURL
      )
    } catch (err) {
      log.error(
        `PublishCustomRemote: unable to set remote URL at ${this.state
          .remoteURL}`,
        err
      )

      errors.push(err)
    }

    if (!errors.length) {
      this.props.onDismissed()
    } else {
      this.setState({ disabled: false, errors })
    }
  }

  private onCancel = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.RepositorySettings,
      repository: this.props.repository,
    })
  }

  private onURLChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ remoteURL: event.currentTarget.value })
  }

  private renderErrors(): JSX.Element[] | null {
    const errors = this.state.errors

    if (!errors || !errors.length) {
      return null
    }

    return errors.map((err, ix) => {
      const key = `err-${ix}`
      return (
        <DialogError key={key}>
          {err}
        </DialogError>
      )
    })
  }
}
