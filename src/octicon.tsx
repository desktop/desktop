import * as React from 'react'
import {OcticonSymbol} from './octicons.generated'

// We do this as a convenience so that others don't have to
// import or know about the generated file.
export {OcticonSymbol as OcticonSymbol};

interface OcticonProps {
  width?: number,
  height?: number,
  symbol: OcticonSymbol
}

/* A React component for displaying octicon symbols in SVG format.
 *
 * Note that the aspect ratios of the octicons will always be preserved
 * which is why the width and height properties specify the maximum and
 * not the minimum size.
 *
 * Usage: `<Octicon symbol={OcticonSymbol.mark_github} />`
 *
 * @param symbol  An instance of an object conforming to the OcticonSymbol
 *                type. Supports custom paths as well as those provided
 *                through the static properties of the OcticonSymbol class.
 *
 * @param width   The maximum width of the icon (optional, defaults to 16)
 * @param height  The maximum height of the icon (optional, defaults to 16)
 */
export class Octicon extends React.Component<OcticonProps, void> {

  public static defaultProps: OcticonProps = {
    width: 16,
    height: 16,
    symbol: OcticonSymbol.markGithub
  }

  public render() {
    const symbol = this.props.symbol
    const viewBox = `0 0 ${symbol.w} ${symbol.h}`
    return (
      <svg aria-hidden='true' className='octicon' width={this.props.width} height={this.props.height} role='img' version='1.1' viewBox={viewBox}>
        <path d={symbol.d}></path>
      </svg>
    )
  }
}
