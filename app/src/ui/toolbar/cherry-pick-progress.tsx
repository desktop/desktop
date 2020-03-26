import * as React from 'react'
import { ICherryPickProgress } from '../../models/progress'
import { ToolbarButton, ToolbarButtonStyle } from './button'
import { OcticonSymbol } from '../octicons'

interface ICherryPickProgressProps {
  /** Progress information associated with the current operation */
  readonly progress: ICherryPickProgress
}

/** Display cherry-pick progress in the toolbar. */
export class CherryPickProgress extends React.Component<
  ICherryPickProgressProps,
  {}
> {
  public render() {
    const progress = this.props.progress
    const title = progress.title || 'Hang on…'
    return (
      <ToolbarButton
        title="Cherry-Picking…"
        description={title}
        progressValue={progress.value}
        className="cherry-pick-progress"
        icon={OcticonSymbol.sync}
        iconClassName="spin"
        style={ToolbarButtonStyle.Subtitle}
        disabled={true}
      />
    )
  }
}
