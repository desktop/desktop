/* eslint-disable jsx-a11y/no-static-element-interactions */
import * as React from 'react'
import { clamp } from '../../lib/clamp'

const DefaultMaxWidth = 350
const DefaultMinWidth = 200

/**
 * Component abstracting a resizable panel.
 *
 * Note: this component is pure, consumers must subscribe to the
 * onResize and onReset event and update the width prop accordingly.
 */
export class Resizable extends React.Component<IResizableProps> {
  private startWidth: number | null = null
  private startX: number | null = null

  /**
   * Returns the current width as determined by props.
   *
   * This value will be constrained by the maximum and minimum
   * with props and might not be identical to that of props.width.
   */
  private getCurrentWidth() {
    return this.clampWidth(this.props.width)
  }

  /**
   * Constrains the provided width to lie within the minimum and
   * maximum widths as determined by props
   */
  private clampWidth(width: number) {
    const { minimumWidth: min, maximumWidth: max } = this.props
    return clamp(width, min ?? DefaultMinWidth, max ?? DefaultMaxWidth)
  }

  /**
   * Handler for when the user presses the mouse button over the resize
   * handle.
   */
  private handleDragStart = (e: React.MouseEvent<any>) => {
    this.startX = e.clientX
    this.startWidth = this.getCurrentWidth()

    document.addEventListener('mousemove', this.handleDragMove)
    document.addEventListener('mouseup', this.handleDragStop)

    e.preventDefault()
  }

  /**
   * Handler for when the user moves the mouse while dragging
   */
  private handleDragMove = (e: MouseEvent) => {
    if (this.startWidth === null || this.startX === null) {
      return
    }

    const deltaX = e.clientX - this.startX
    const newWidth = this.startWidth + deltaX

    this.props.onResize(this.clampWidth(newWidth))
    e.preventDefault()
  }

  private unsubscribeFromGlobalEvents() {
    document.removeEventListener('mousemove', this.handleDragMove)
    document.removeEventListener('mouseup', this.handleDragStop)
  }

  /**
   * Handler for when the user lets go of the mouse button during
   * a resize operation.
   */
  private handleDragStop = (e: MouseEvent) => {
    this.unsubscribeFromGlobalEvents()
    e.preventDefault()
  }

  public render() {
    const style: React.CSSProperties = {
      width: this.getCurrentWidth(),
      maxWidth: this.props.maximumWidth,
      minWidth: this.props.minimumWidth,
    }

    return (
      <div id={this.props.id} className="resizable-component" style={style}>
        {this.props.children}
        <div
          onMouseDown={this.handleDragStart}
          onDoubleClick={this.props.onReset}
          className="resize-handle"
        />
      </div>
    )
  }
}

export interface IResizableProps {
  readonly width: number

  /** The maximum width the panel can be resized to.
   *
   * @default 350
   */
  readonly maximumWidth?: number

  /**
   * The minimum width the panel can be resized to.
   *
   * @default 150
   */
  readonly minimumWidth?: number

  /** The optional ID for the root element. */
  readonly id?: string

  /**
   * Handler called when the width of the component has changed
   * through an explicit resize event (dragging the handle).
   */
  readonly onResize: (newWidth: number) => void

  /**
   * Handler called when the resizable component has been
   * reset (ie restored to its original width by double clicking
   * on the resize handle).
   */
  readonly onReset: () => void
}
