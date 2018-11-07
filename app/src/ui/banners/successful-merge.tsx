import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'

interface ISuccessfulMergeProps {
  readonly currentBranch: string
  readonly theirBranch: string
  readonly onDismissed: () => void
}

export class SuccessfulMerge extends React.Component<
  ISuccessfulMergeProps,
  {}
> {
  private timeoutId: NodeJS.Timer | null = null

  public render() {
    return (
      <div id="successful-merge" className="active">
        <div className="green-circle">
          <Octicon className="check-icon" symbol={OcticonSymbol.check} />
        </div>
        <div className="banner-message">
          <span>
            {'Successfully merged '}
            <strong>{this.props.theirBranch}</strong>
            {' into '}
            <strong>{this.props.currentBranch}</strong>
          </span>
        </div>
        <div className="close">
          <a onClick={this.dismiss}>
            <Octicon symbol={OcticonSymbol.x} />
          </a>
        </div>
      </div>
    )
  }

  public componentDidMount = () => {
    this.timeoutId = setTimeout(() => {
      this.dismiss()
    }, 5000)
  }

  public componentWillUnmount = () => {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
    }
  }

  private dismiss = () => {
    this.props.onDismissed()
  }
}
