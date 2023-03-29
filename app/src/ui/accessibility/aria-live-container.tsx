import React, { Component } from 'react'

interface IAriaLiveContainerProps {
  /**
   * Whether or not the component should make an invisible change to the content
   * in order to force the screen reader to read the content again.
   */
  readonly shouldForceChange?: boolean
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
export class AriaLiveContainer extends Component<IAriaLiveContainerProps> {
  private shouldForceChange: boolean = false
  private suffix: string = ''

  public componentDidUpdate(prevProps: IAriaLiveContainerProps) {
    this.shouldForceChange = prevProps.shouldForceChange ?? false
  }

  public render() {
    const shouldForceChange = this.shouldForceChange
    this.shouldForceChange = false

    if (shouldForceChange) {
      this.suffix = this.suffix === '' ? '\u00A0' : ''
    }

    return (
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {this.props.children}
        {this.suffix}
      </div>
    )
  }
}
