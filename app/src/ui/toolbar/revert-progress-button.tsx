import * as React from 'react'
import { ToolbarButton, ToolbarButtonStyle } from './button'
import { OcticonSymbol } from '../octicons'
import { Progress } from '../../lib/app-state'

interface IRevertProgressButtonProps {
  /** Progress information associated with the current operation */
  readonly progress: Progress
}

export class RevertProgressButton extends React.Component<
  IRevertProgressButtonProps,
  {}
> {
  public render() {
    const progress = this.props.progress
    const description = progress.description || 'Hang on…'
    return (
      <ToolbarButton
        title="Reverting…"
        description={description}
        progressValue={progress.value}
        className="revert-progress-button"
        icon={OcticonSymbol.sync}
        iconClassName="spin"
        style={ToolbarButtonStyle.Subtitle}
        disabled={true}
      >
        Hey
      </ToolbarButton>
    )
  }
}
