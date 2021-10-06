import * as React from 'react'
import { Octicon, OcticonSymbolType } from '../octicons'

interface IHintProps {
  readonly symbol: OcticonSymbolType
  readonly title: string
  readonly description: string
}

interface IHintState {
  readonly isTooltipShown: boolean
}

export class Hint extends React.Component<IHintProps, IHintState> {
  public constructor(props: IHintProps) {
    super(props)
    this.state = {
      isTooltipShown: false,
    }
  }

  private renderTooltip() {
    return (
      <div className="hint-tooltip">
        <div className="hint-title">{this.props.title}</div>
        <div className="hint-description">{this.props.description}</div>
      </div>
    )
  }

  private onHintMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    this.showTooltip()
  }

  private onHintMouseLeave = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    this.hideTooltip()
  }

  private showTooltip() {
    this.setState(prevState => ({ ...prevState, isTooltipShown: true }))
  }

  private hideTooltip() {
    this.setState(prevState => ({ ...prevState, isTooltipShown: false }))
  }

  public render() {
    return (
      <div
        className="hint-component"
        onMouseEnter={this.onHintMouseEnter}
        onMouseLeave={this.onHintMouseLeave}
      >
        <Octicon symbol={this.props.symbol} />
        {this.state.isTooltipShown && this.renderTooltip()}
      </div>
    )
  }
}
