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
  readonly thisNeedsABetterNameButMyIneptitudePreventsIt?: boolean
  readonly functionToRunWhenThisNeedsABetterNameButMyIneptitudePreventsItIsTrue?: (dontAskAgain: boolean) => void
  readonly onConfirmation: () => void
}

interface IConfirmDialogState {
  readonly dontAskAgain: boolean,
}

export class ConfirmDialog extends React.Component<IConfirmDialogProps, IConfirmDialogState> {
  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  private onConfirmed = () => {
    this.props.onConfirmation()
    this.props.dispatcher.closePopup()
  }

  private onCheckboxChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const dontAskAgainSelected = event.currentTarget.checked
    const fn = this.props.functionToRunWhenThisNeedsABetterNameButMyIneptitudePreventsItIsTrue

    if (!fn) {
      return
    }

    fn(dontAskAgainSelected)
  }

  private askToNotBeAnnoyed() {
    if (!this.props.thisNeedsABetterNameButMyIneptitudePreventsIt) {
      return null
    }

    return (
      <Checkbox
        label='Do not ask again'
        value={CheckboxValue.Off}
        onChange={this.onCheckboxChanged}
      />
    )
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
          {this.askToNotBeAnnoyed()}
          <ButtonGroup>
            <Button type='submit'>Yes</Button>
            <Button onClick={this.cancel}>No</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
