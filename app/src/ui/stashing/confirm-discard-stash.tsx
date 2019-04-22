import React = require('react')
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { IStashEntry } from '../../models/stash-entry'

interface IDiscardStashProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly stash: IStashEntry
  readonly onDismissed: () => void
}

interface IDiscardStashState {
  readonly isDiscarding: boolean
}
/**
 * Dialog to confirm dropping a stash
 */
export class DiscardStash extends React.Component<
  IDiscardStashProps,
  IDiscardStashState
> {
  public constructor(props: IDiscardStashProps) {
    super(props)

    this.state = {
      isDiscarding: false,
    }
  }

  public render() {
    const title = __DARWIN__ ? 'Discard Stash?' : 'Discard stash?'

    return (
      <Dialog
        id="discard-stash"
        type="warning"
        title={title}
        loading={this.state.isDiscarding}
        disabled={this.state.isDiscarding}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>Are you sure you want to discard these stashed changes?</Row>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Discard</Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const { dispatcher, repository, stash, onDismissed } = this.props

    this.setState({
      isDiscarding: true,
    })

    try {
      await dispatcher.dropStash(repository, stash)
    } finally {
      this.setState({
        isDiscarding: false,
      })
    }

    onDismissed()
  }
}
