import * as React from 'react'

interface IFilesChangedBadgeProps {
  readonly filesChangedCount: number
}

/** The number of changes above which the count is shortened to "x00+" for brevity */
const FloorChangesCountToHundredThreshold = 300

/** Displays number of files that have changed */
export class FilesChangedBadge extends React.Component<
  IFilesChangedBadgeProps,
  {}
> {
  public render() {
    const filesChangedCount = this.props.filesChangedCount
    const badgeCount =
      filesChangedCount >= FloorChangesCountToHundredThreshold
        ? `${Math.floor(filesChangedCount / 100) * 100}+`
        : filesChangedCount

    return <span className="counter">{badgeCount}</span>
  }
}
