import * as React from 'react'
import { IRevertProgress } from '../../models/progress'
import { ToolbarButton, ToolbarButtonStyle } from './button'
import { syncClockwise } from '../octicons'
import { enableResizingToolbarButtons } from '../../lib/feature-flag'
import { Resizable } from '../resizable'
import { IConstrainedValue } from '../../lib/app-state'
import { Dispatcher } from '../dispatcher'

interface IRevertProgressProps {
  /** Progress information associated with the current operation */
  readonly progress: IRevertProgress

  /** The width of the resizable push/pull button, as derived from AppState. */
  readonly width: IConstrainedValue

  /** The global dispatcher, to invoke repository operations. */
  readonly dispatcher: Dispatcher
}

/** Display revert progress in the toolbar. */
export class RevertProgress extends React.Component<IRevertProgressProps, {}> {
  /**
   * Handler called when the width of the button has changed
   * through an explicit resize event to the given width.
   *
   * @param width The new width of resizable button.
   */
  private onResize = (width: number) => {
    // The Revert button is rendered instead of the Push/Pull button, so we use it's width
    this.props.dispatcher.setPushPullButtonWidth(width)
  }

  /**
   * Handler called when the resizable button has been
   * asked to restore its original width.
   */
  private onReset = () => {
    // The Revert button is rendered instead of the Push/Pull button, so we use it's width
    this.props.dispatcher.resetPushPullButtonWidth()
  }

  public render() {
    const progress = this.props.progress
    const title = progress.title || 'Hang on…'

    if (!enableResizingToolbarButtons()) {
      return (
        <ToolbarButton
          title="Reverting…"
          description={title}
          progressValue={progress.value}
          className="revert-progress"
          icon={syncClockwise}
          iconClassName="spin"
          style={ToolbarButtonStyle.Subtitle}
          disabled={true}
        />
      )
    }

    return (
      <Resizable
        width={this.props.width.value}
        onReset={this.onReset}
        onResize={this.onResize}
        maximumWidth={this.props.width.max}
        minimumWidth={this.props.width.min}
        description="Revert progress button"
      >
        <ToolbarButton
          title="Reverting…"
          description={title}
          progressValue={progress.value}
          className="revert-progress"
          icon={syncClockwise}
          iconClassName="spin"
          style={ToolbarButtonStyle.Subtitle}
          disabled={true}
        />
      </Resizable>
    )
  }
}
