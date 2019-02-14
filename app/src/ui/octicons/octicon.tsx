import * as React from 'react'
import { OcticonSymbol } from './octicons.generated'
import * as classNames from 'classnames'

interface IOcticonProps {
  /**
   * An instance of an object conforming to the OcticonSymbol
   * type. Supports custom paths as well as those provided
   * through the static properties of the OcticonSymbol class.
   */
  readonly symbol: OcticonSymbol

  /**
   * An optional classname that will be appended to the default
   * class name 'octicon'
   */
  readonly className?: string

  /**
   * An optional string to use as a tooltip for the icon
   */
  readonly title?: string
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
export class Octicon extends React.Component<IOcticonProps, {}> {
  public static defaultProps: IOcticonProps = {
    symbol: OcticonSymbol.markGithub,
  }

  public shouldComponentUpdate(nextProps: IOcticonProps) {
    if (
      nextProps.symbol.w !== this.props.symbol.w ||
      nextProps.symbol.h !== this.props.symbol.h ||
      nextProps.symbol.d !== this.props.symbol.d ||
      nextProps.className !== this.props.className
    ) {
      return true
    }

    return false
  }

  private renderTitle() {
    const title = this.props.title

    if (!title) {
      return null
    }

    return <title>{title}</title>
  }

  public render() {
    const symbol = this.props.symbol
    const viewBox = `0 0 ${symbol.w} ${symbol.h}`
    const shortClassName = this.props.className
    const className = classNames('octicon', shortClassName)
    const title = this.props.title

    return (
      <svg
        aria-hidden="true"
        aria-labelledby="octiconTitle octiconDescription"
        className={className}
        version="1.1"
        viewBox={viewBox}
      >
        <title id="octiconTitle">{title}</title>
        <desc id="octiconDescription">{shortClassName}</desc>
        <path d={symbol.d}>{this.renderTitle()}</path>
      </svg>
    )
  }
}
