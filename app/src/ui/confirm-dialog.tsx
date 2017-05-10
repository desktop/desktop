import * as React from 'react'
import { Dispatcher } from '../lib/dispatcher'
import { ButtonGroup } from '../ui/lib/button-group'
import { Button } from '../ui/lib/button'
import { Checkbox, CheckboxValue } from '../ui/lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog'

interface IConfirmDialogProps {
  readonly dispatcher: Dispatcher
  readonly title: string
  readonly message: string
  readonly functionToRunWhenThisNeedsABetterNameButMyIneptitudePreventsItIsTrue?: (dontAskAgain: boolean) => void
  readonly onConfirmation: () => void
}

interface IConfirmDialogState {
  readonly dontAskAgainChecked: boolean,
}

export class ConfirmDialog extends React.Component<IConfirmDialogProps, IConfirmDialogState> {
  public constructor(props: IConfirmDialogProps) {
    super(props)

    this.state = {
      dontAskAgainChecked: false,
    }
  }

  private persistState = () => {
    const fn = this.props.functionToRunWhenThisNeedsABetterNameButMyIneptitudePreventsItIsTrue

    if (fn) {
      fn(this.state.dontAskAgainChecked)
    }
  }

  private cancel = () => {
    this.persistState()
    this.props.dispatcher.closePopup()
  }

  private onConfirmed = () => {
    this.persistState()
    this.props.onConfirmation()
    this.props.dispatcher.closePopup()
  }

  private onCheckboxChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const dontAskAgainChecked = event.currentTarget.checked

    this.setState({ dontAskAgainChecked })
  }

  public render() {
    return (
      <Dialog
        title={this.props.title}
        onDismissed={this.cancel}
        onSubmit={this.onConfirmed}
      >
        <DialogContent>
          {this.props.message}
        </DialogContent>
        <DialogFooter>
        <Checkbox
          label='Do not ask again'
          value={this.state.dontAskAgainChecked ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onCheckboxChanged}
        />
          <ButtonGroup>
            <Button type='submit'>Yes</Button>
            <Button onClick={this.cancel}>No</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
