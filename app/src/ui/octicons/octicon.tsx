import * as React from 'react'
import { OcticonSymbol } from './octicons.generated'

interface IOcticonProps {
  /**
   * An instance of an object conforming to the OcticonSymbol
   * type. Supports custom paths as well as those provided
   * through the static properties of the OcticonSymbol class.
   */
  symbol: OcticonSymbol
}

/**
 * A React component for displaying octicon symbols in SVG format.
 *
 * Note that the aspect ratios of the octicons will always be preserved
 * which is why the width and height properties specify the maximum and
 * not the minimum size.
 *
 * Usage: `<Octicon symbol={OcticonSymbol.mark_github} />`
 *
 * @see OcticonProps
 * @extends React.Component<OcticonProps, void>
 */
export class Octicon extends React.Component<IOcticonProps, void> {

  public static defaultProps: IOcticonProps = {
    symbol: OcticonSymbol.markGithub
  }

  public shouldComponentUpdate(nextProps: IOcticonProps, nextState: void) {

    if (nextProps.symbol.w !== this.props.symbol.w ||
       nextProps.symbol.h !== this.props.symbol.h ||
       nextProps.symbol.d !== this.props.symbol.d) {
       return true
     }

     return false
  }

  public render() {
    const symbol = this.props.symbol
    const viewBox = `0 0 ${symbol.w} ${symbol.h}`
    return (
      <svg aria-hidden='true' className='octicon' role='img' version='1.1' viewBox={viewBox}>
        <path d={symbol.d}></path>
      </svg>
    )
  }
}
