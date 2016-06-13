import * as React from 'react'
import {OcticonSymbol} from './octicons.generated'

export {OcticonSymbol as OcticonSymbol};

interface OcticonProps {
  width?: number,
  height?: number,
  symbol: OcticonSymbol
}

export class Octicon extends React.Component<OcticonProps, void> {

  public static defaultProps: OcticonProps = { width: 16, height: 16, symbol: OcticonSymbol.mark_github };

  public constructor(props: OcticonProps) {
    super(props)
  }

  public render() {
    const symbol = this.props.symbol;
    const viewBox = `0 0 ${symbol.w} ${symbol.h}`
    return (
      <svg aria-hidden="true" className="octicon" width={this.props.width} height={this.props.height} role="img" version="1.1" viewBox={viewBox}>
        <path d={symbol.d}></path>
      </svg>
    )
  }
}
