import * as React from 'react'

interface IFilesChangedBadgeProps {
  readonly filesChangedCount: number
}

/** The number that can be displayed as a specific value */
const MaximumChangesCount = 300

/** Displays number of files that have changed */
export class FilesChangedBadge extends React.Component<
  IFilesChangedBadgeProps,
  {}
> {
  public render() {
    const filesChangedCount = this.props.filesChangedCount
    const badgeCount =
      filesChangedCount > MaximumChangesCount
        ? `${MaximumChangesCount}+`
        : filesChangedCount

    return <span className="counter">{badgeCount}</span>
  }
}
