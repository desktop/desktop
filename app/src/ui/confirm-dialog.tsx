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
  readonly dontAskAgain: boolean,
}

export class ConfirmDialog extends React.Component<IConfirmDialogProps, IConfirmDialogState> {
  public constructor(props: IConfirmDialogProps) {
    super(props)


    this.state = {
      dontAskAgain: dontAsk ? dontAsk : false,
    }
  }

  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  private onConfirmed = () => {
    const fn = this.props.functionToRunWhenThisNeedsABetterNameButMyIneptitudePreventsItIsTrue

    if (fn) {
      fn(this.state.dontAskAgain)
    }

    this.props.onConfirmation()
    this.props.dispatcher.closePopup()
  }

  private onCheckboxChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const dontAskAgain = !event.currentTarget.checked

    this.setState({ dontAskAgain })
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
          <ButtonGroup>
            <Button type='submit'>Yes</Button>
            <Button onClick={this.cancel}>No</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
