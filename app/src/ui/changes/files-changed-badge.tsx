import * as React from 'react'

interface IFilesChangedBadgeProps {
  readonly numFilesChanged: number
}

/** The number that can be displayed as a specific value */
const LargeNumber = 300

/** Displays number of files that have changed */
export class FilesChangedBadge extends React.Component<
  IFilesChangedBadgeProps,
  {}
> {
  public render() {
    const numFilesChanged = this.props.numFilesChanged
    const badgeCount =
      numFilesChanged > LargeNumber ? `${LargeNumber}+` : numFilesChanged

    return <span className="counter">{badgeCount}</span>
  }
}
