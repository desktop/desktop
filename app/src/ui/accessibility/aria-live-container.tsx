import { debounce } from 'lodash'
import React, { Component } from 'react'

interface IAriaLiveContainerProps {
  /**
   * There is a common pattern that we may need to announce a message in
   * response to user input. Unfortunately, aria-live announcements are
   * interrupted by continued user input. We can force a rereading of a message
   * by appending an invisible character when the user finishes their input.
   *
   * For example, we have a search filter for a list of branches and we need to
   * announce how may results are found. Say a list of branches and the user
   * types "ma", the message becomes "1 result", but if they continue to type
   * "main" the message will have been interrupted.
   *
   * This prop allows us to pass in when the user input changes. This can either
   * be directly passing in the user input on change or a boolean representing
   * when we want the message re-read. We can append the invisible character to
   * force the screen reader to read the message again after each input. To
   * prevent the message from being read too much, we debounce the message.
   */
  readonly trackedUserInput?: string | boolean

  /** Optional id that can be used to associate the message to a control */
  readonly id?: string
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
      message: null,
    }
  }

  public componentDidUpdate(prevProps: IAriaLiveContainerProps) {
    if (prevProps.trackedUserInput === this.props.trackedUserInput) {
      return
    }

    this.onTrackedInputChanged(this.buildMessage())
  }

  public componentWillUnmount() {
    this.onTrackedInputChanged.cancel()
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
      <div
        id={this.props.id}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {this.state.message}
      </div>
    )
  }
}
