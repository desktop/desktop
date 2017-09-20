import * as React from 'react'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { Resizable } from '../resizable'

interface IPersistingResizableProps {
  /** String key used when persisting the panel width to localStorage */
  readonly configKey: string

  /** The optional ID for the root element. */
  readonly id?: string

  /**
   * The default width of the panel.
   *
   * The default width is used until user first resizes the
   * panel or when the custom size is explicitly reset by
   * double clicking on the resize handle.
   *
   * @default 250
   */
  readonly defaultWidth?: number

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
}

interface IPersistingResizableState {
  /**
   * The width of the panel in pixels.
   * Optional
   */
  readonly width?: number
}

/**
 * Component abstracting a resizable panel.
 *
 * Handles user resizing and persistence of the width.
 *
 * Soft deprecated, new consumers should opt for the pure
 * Resizable component and manage persistence themselves.
 */
export class PersistingResizable extends React.Component<
  IPersistingResizableProps,
  IPersistingResizableState
> {
  public static defaultProps: IPersistingResizableProps = {
    configKey: 'resizable-width',
    defaultWidth: 250,
  }

  private configWriteScheduler = new ThrottledScheduler(300)

  public constructor(props: IPersistingResizableProps) {
    super(props)
    this.state = { width: this.getPersistedWidth() }
  }

  private getPersistedWidth(): number | undefined {
    const storedWidth = parseInt(
      localStorage.getItem(this.props.configKey) || '',
      10
    )
    if (!storedWidth || isNaN(storedWidth)) {
      return this.props.defaultWidth
    }

    return storedWidth
  }

  private setPersistedWidth(newWidth: number) {
    this.configWriteScheduler.queue(() => {
      localStorage.setItem(this.props.configKey, newWidth.toString())
    })
  }

  private clearPersistedWidth() {
    this.configWriteScheduler.queue(() => {
      localStorage.removeItem(this.props.configKey)
    })
  }

  private getCurrentWidth(): number {
    return this.state && this.state.width
      ? this.state.width
      : this.props.defaultWidth ||
          PersistingResizable.defaultProps.defaultWidth!
  }

  private handleResize = (newWidth: number) => {
    this.setPersistedWidth(newWidth)
    this.setState({ width: newWidth })
  }

  private handleReset = () => {
    this.clearPersistedWidth()
    this.setState({ width: undefined })
  }

  public render() {
    return (
      <Resizable
        id={this.props.id}
        width={this.getCurrentWidth()}
        minimumWidth={this.props.minimumWidth}
        maximumWidth={this.props.maximumWidth}
        onResize={this.handleResize}
        onReset={this.handleReset}
      >
        {this.props.children}
      </Resizable>
    )
  }
}
