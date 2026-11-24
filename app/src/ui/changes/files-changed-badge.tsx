import * as React from 'react'
import { formatCompactNumber } from '../../lib/format-number'

interface IFilesChangedBadgeProps {
  readonly filesChangedCount: number
}

/** Displays number of files that have changed */
export class FilesChangedBadge extends React.Component<
  IFilesChangedBadgeProps,
  {}
> {
  public render() {
    return (
      <span className="counter">
        {formatCompactNumber(this.props.filesChangedCount)}
      </span>
    )
  }
}
