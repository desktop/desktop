import * as React from 'react'

interface IFilesChangedBadgeProps {
  readonly numFilesChanged: number
}

interface IFilesChangedBadgeState {
  readonly badgeCount: string
}

function createState(props: IFilesChangedBadgeProps): IFilesChangedBadgeState {
  if (props.numFilesChanged === 0) {
    return { badgeCount: '' }
  }

  /** The number that can be displayed as a specific value */
  const LargeNumber = 300
  const badgeCount =
    props.numFilesChanged > LargeNumber ? `${LargeNumber}+` : props.numFilesChanged.toString()

  return { badgeCount }
}

/** Displays number of files that have changed */
export class FilesChangedBadge extends React.Component<
  IFilesChangedBadgeProps,
  IFilesChangedBadgeState
> {
  static getDerivedStateFromProps(props: IFilesChangedBadgeProps): IFilesChangedBadgeState {
    return createState(props)
  }

  public constructor(props: IFilesChangedBadgeProps) {
    super(props)

    this.state = createState(props)
  }

  public render() {
    const badgeCount = this.state.badgeCount

    if (!badgeCount) {
      return null
    }

    return (
      <span className="counter">{badgeCount}</span>
    )
  }
}
