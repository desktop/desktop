import { debounce } from 'lodash'
import React, { Component } from 'react'

interface IAriaLiveContainerProps {
  /** Debounce on change */
  readonly trackedUserInput?: string | boolean
}

interface IAriaLiveContainerState {
  /** The generated message for the screen reader */
  readonly message: JSX.Element | null
}

/**
 * This component encapsulates aria-live containers, which are used to
 * communicate changes to screen readers. The container is hidden from
 * view, but the screen reader will read the contents of the container
 * when it changes.
 *
 * It also allows to make an invisible change in the content in order to force
 * the screen reader to read the content again. This is useful when the content
 * is the same but the screen reader should read it again.
 */
export class AriaLiveContainer extends Component<
  IAriaLiveContainerProps,
  IAriaLiveContainerState
> {
  private suffix: string = ''
  private onTrackedInputChanged = debounce((message: JSX.Element | null) => {
    this.setState({ message })
  }, 1000)

  public constructor(props: IAriaLiveContainerProps) {
    super(props)

    this.state = {
      message: this.buildMessage(),
    }
  }

  public componentDidUpdate(prevProps: IAriaLiveContainerProps) {
    if (prevProps.trackedUserInput === this.props.trackedUserInput) {
      return
    }

    this.onTrackedInputChanged(this.buildMessage())
  }

  private buildMessage() {
    this.suffix = this.suffix === '' ? '\u00A0' : ''

    return (
      <>
        {this.props.children}
        {this.suffix}
      </>
    )
  }

  public render() {
    return (
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {this.state.message}
      </div>
    )
  }
}
