import * as React from 'react'
import { OcticonSymbol, OcticonSymbolVariant } from '.'
import classNames from 'classnames'
import ReactDOM from 'react-dom'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip, TooltipDirection } from '../lib/tooltip'

interface IOcticonProps {
  /**
   * An instance of an object conforming to the OcticonSymbol type. Supports
   * custom paths as well as those provided through the static properties of
   * the OcticonSymbol class.
   */
  readonly symbol: OcticonSymbol

  /**
   * An optional classname that will be appended to the default
   * class name 'octicon'
   */
  readonly className?: string

  /**
   * An optional string to use as a tooltip and aria-label for the icon
   */
  readonly title?: string

  readonly tooltipDirection?: TooltipDirection

  readonly height?: number
}

/**
 * A React component for displaying octicon symbols in SVG format.
 *
 * Note that the aspect ratios of the octicons will always be preserved
 * which is why the width and height properties specify the maximum and
 * not the minimum size.
 *
 * Usage: `<Octicon symbol={octicons.markGithub} />`
 */
export class Octicon extends React.Component<IOcticonProps, {}> {
  private svgRef = createObservableRef<SVGSVGElement>()

  public render() {
    const { symbol } = this.props

    if (this.isSingleVariant(symbol)) {
      return this.renderIcon(symbol.p, symbol.h, symbol.w)
    } else {
      const height = this.props.height ?? 16
      const naturalHeight = this.closestNaturalHeight(
        Object.keys(symbol).map(h => parseInt(h, 10)) as Array<number>,
        height
      )

      const scaledSymbol = symbol[naturalHeight]

      if (scaledSymbol === undefined) {
        // Should never happen, but if it does the app should still be usable
        return null
      }

      const naturalWidth = scaledSymbol.w
      const width = height * (naturalWidth / naturalHeight)

      return this.renderIcon(scaledSymbol.p, height, width)
    }
  }

  private renderIcon(paths: string[], height: number, width: number) {
    const { title, tooltipDirection } = this.props
    const viewBox = `0 0 ${width} ${height}`
    const className = classNames('octicon', this.props.className)

    // Hide the octicon from screen readers when it's only being used
    // as a visual without any attached meaning applicable to users
    // consuming the app through an accessibility interface.
    const ariaHidden = title === undefined ? 'true' : undefined

    // Octicons are typically very small so having an explicit direction makes
    // more sense
    const direction = tooltipDirection ?? TooltipDirection.NORTH

    return (
      <svg
        aria-hidden={ariaHidden}
        aria-label={title}
        className={className}
        version="1.1"
        viewBox={viewBox}
        ref={this.svgRef}
        tabIndex={-1}
        height={height}
        width={width}
      >
        {title !== undefined && (
          <Tooltip target={this.svgRef} direction={direction}>
            {title}
          </Tooltip>
        )}

        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    )
  }

  /**
   * Determine if the given symbol is a single variant or a set of variants.
   *
   * @param symbol The symbol to check.
   * @returns      True if the symbol is a single variant, false if it's a set.
   */
  private isSingleVariant(
    symbol: OcticonSymbol
  ): symbol is OcticonSymbolVariant {
    return (
      symbol instanceof Object &&
      symbol.hasOwnProperty('p') &&
      symbol.hasOwnProperty('h') &&
      symbol.hasOwnProperty('w')
    )
  }

  /**
   * Find the closest natural height to the given height. Falls back to the
   * first height in the list if none are larger or equal than the given height.
   *
   * @param naturalHeights The list of natural heights to choose from.
   * @param height         The height to find the closest natural height to.
   * @returns              The closest natural height to the given height.
   */
  private closestNaturalHeight(naturalHeights: Array<number>, height: number) {
    return naturalHeights.reduce(
      (acc, naturalHeight) => (naturalHeight <= height ? naturalHeight : acc),
      naturalHeights[0]
    )
  }
}

/**
 * Create an Octicon element for the DOM, wrapped in a div element.
 *
 * @param symbol    OcticonSymbol to render in the element.
 * @param className Optional class to add to the wrapper element.
 * @param id        Optional identifier to set to the wrapper element.
 */
export function createOcticonElement(
  symbol: OcticonSymbol,
  className?: string,
  id?: string
) {
  const wrapper = document.createElement('div')
  wrapper.id = id ?? ''
  if (className !== undefined) {
    wrapper.classList.add(className)
  }
  const octicon = <Octicon symbol={symbol} />
  ReactDOM.render(octicon, wrapper)
  return wrapper
}
