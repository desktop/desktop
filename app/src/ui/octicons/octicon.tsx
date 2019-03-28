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

  /**
   * An optional string to provide accessible descriptive text
   */
  readonly description?: string
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
    const description = this.props.description

    return (
      <svg
        aria-labelledby="octiconTitle octiconDescription"
        className={className}
        version="1.1"
        viewBox={viewBox}
      >
        <title id="octiconTitle">{title}</title>
        <desc id="octiconDescription">{description}</desc>
        <path d={symbol.d}>{this.renderTitle()}</path>
      </svg>
    )
  }
}
