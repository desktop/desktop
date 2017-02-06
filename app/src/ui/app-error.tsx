import * as React from 'react'
import * as  ReactCSSTransitionGroup from 'react-addons-css-transition-group'

import { IAppError } from '../lib/app-state'
import { Button } from './lib/button'
import { ButtonGroup } from './lib/button-group'
import { Dialog, DialogContent, DialogFooter } from './dialog'
import { dialogTransitionEnterTimeout, dialogTransitionLeaveTimeout } from './app'

interface IAppErrorProps {
  readonly errors: ReadonlyArray<IAppError>
  readonly onClearError: (error: IAppError) => void
}

interface IAppErrorState {
  readonly error: IAppError | null
  readonly disabled: boolean
}

export class AppError extends React.Component<IAppErrorProps, IAppErrorState> {

  public constructor(props: IAppErrorProps) {
    super(props)
    this.state = {
      error: props.errors[0] || null,
      disabled: false,
    }
  }

  public componentWillReceiveProps(nextProps: IAppErrorProps) {
    if (nextProps.errors.length) {
      const error = nextProps.errors[0]

      if (error !== this.state.error) {
        this.setState({ error, disabled: false })
      }
    }
  }

  private onDismissed = () => {
    const currentError = this.state.error

    if (currentError) {
      this.setState({ error: null, disabled: true })
      setTimeout(() => {
        this.props.onClearError(currentError)
      }, dialogTransitionLeaveTimeout)
    }
  }

  private renderDialog() {

    const error = this.state.error

    if (!error) {
      return null
    }

    return (
      <Dialog
        id='app-error'
        type='error'
        title='Error'
        onDismissed={this.onDismissed}
        disabled={this.state.disabled}
      >
        <DialogContent>
          {error.message}
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type='submit'>Close</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  public render() {
    return (
      <ReactCSSTransitionGroup
        transitionName='modal'
        component='div'
        transitionEnterTimeout={dialogTransitionEnterTimeout}
        transitionLeaveTimeout={dialogTransitionLeaveTimeout}
      >
        {this.renderDialog()}
      </ReactCSSTransitionGroup>
    )
  }
}
