import * as React from 'react'

interface IFilesChangedBadgeProps {
  readonly numFilesChanged: number
}

/** The number that can be displayed as a specific value */
const LargeNumber = 300;

/** Displays number of files that have changed */
export class FilesChangedBadge extends React.Component<
  IFilesChangedBadgeProps,
  {}
> {
  private get badgeCount() {
    const numFilesChanged = this.props.numFilesChanged;

    return numFilesChanged > LargeNumber ? `${LargeNumber}+` : numFilesChanged;
  }

  public render() {
    if (!this.props.numFilesChanged) {
      return null;
    }

    return (
      <span className="counter">{this.badgeCount}</span>
    )
  }
}
