import * as React from 'react'
import { DialogHeader } from './header'

interface IDialogProps {
  readonly title?: string
  readonly dismissable?: boolean
  readonly onDismissed?: () => void
  readonly id?: string
}

export class Dialog extends React.Component<IDialogProps, void> {

  private dialogElement?: HTMLElement

  private isDismissable() {
    return this.props.dismissable === undefined || this.props.dismissable
  }

  public componentDidMount() {
    (this.dialogElement as any).showModal()
  }

  private onDialogCancel = (e: Event) => {
    e.preventDefault()
    this.onDismiss()
  }

  private onDialogClick = (e: React.MouseEvent<HTMLElement>) => {

    if (!this.isDismissable) {
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()

    // http://stackoverflow.com/a/26984690/2114
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width

    if (!isInDialog) {
      e.preventDefault()
      this.onDismiss()
    }
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

  private onDismiss = () => {
    if (this.isDismissable()) {
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
      <dialog ref={this.onDialogRef} id={this.props.id} onClick={this.onDialogClick}>
          {this.renderHeader()}
          {this.props.children}
      </dialog>
    )
  }
}
