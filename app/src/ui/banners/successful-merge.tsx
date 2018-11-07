import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'

interface ISuccessfulMergeProps {
  readonly ourBranch: string
  readonly theirBranch?: string
  readonly onDismissed: () => void
}

export class SuccessfulMerge extends React.Component<
  ISuccessfulMergeProps,
  {}
> {
  private timeoutId: NodeJS.Timer | null = null

  private renderMessage(ourBranch: string, theirBranch?: string) {
    return theirBranch !== undefined ? (
      <span>
        {'Successfully merged '}
        <strong>{theirBranch}</strong>
        {' into '}
        <strong>{ourBranch}</strong>
      </span>
    ) : (
      <span>
        {'Successfully merged into '}
        <strong>{ourBranch}</strong>
      </span>
    )
  }

  public render() {
    return (
      <div id="successful-merge" className="active">
        <div className="green-circle">
          <Octicon className="check-icon" symbol={OcticonSymbol.check} />
        </div>
        <div className="banner-message">
          {this.renderMessage(this.props.ourBranch, this.props.theirBranch)}
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
