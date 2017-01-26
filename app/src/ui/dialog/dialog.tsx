import * as React from 'react'
import { DialogHeader } from './header'

interface IDialogProps {
  readonly title?: string
  readonly dismissable?: boolean
  readonly onDismissed?: () => void
  readonly id?: string
}

interface IDialogState {
  readonly isOpen: boolean
}

export class Dialog extends React.Component<IDialogProps, IDialogState> {

  private dialogElement?: HTMLElement

  public constructor(props: IDialogProps) {
    super(props)
    this.state = { isOpen: false }
  }

  private isDismissable() {
    return this.props.dismissable === undefined || this.props.dismissable
  }

  public componentDidMount() {
    (this.dialogElement as any).showModal()
    this.setState({ isOpen: true })
  }

  public componentWillUnmount() {
    this.close()
  }

  private onDialogCancel = (e: Event) => {
    console.log('o hai cancel')
    e.preventDefault()
    this.onDismiss()
  }

  private onDialogRef = (e: HTMLElement | undefined) => {
    if (!e) {
      if (this.dialogElement) {
        this.dialogElement.removeEventListener('cancel', this.onDialogCancel)
      }
    } else {
      e.addEventListener('cancel', this.onDialogCancel)
    }

    this.dialogElement = e
  }

  private close() {
    if (this.state.isOpen) {
      if (this.dialogElement) {
        (this.dialogElement as any).close()
      }

      this.setState({ isOpen: false })
    }
  }

  private onDismiss = () => {
    if (this.isDismissable()) {
      this.close()
      if (this.props.onDismissed) {
        this.props.onDismissed()
      }
    }
  }

  private renderHeader() {
    if (!this.props.title) {
      return null
    }

    return (
      <DialogHeader
        title={this.props.title}
        dismissable={this.isDismissable()}
        onDismissed={this.onDismiss}
      />
    )
  }

  public render() {
    return (
      <dialog ref={this.onDialogRef} id={this.props.id}>
        {this.renderHeader()}
        {this.props.children}
      </dialog>
    )
  }
}
