import * as React from 'react'
import { OcticonSymbolType } from './octicons.generated'
import classNames from 'classnames'
import ReactDOM from 'react-dom'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip, TooltipDirection } from '../lib/tooltip'

interface IOcticonProps {
  /**
   * An instance of an object conforming to the OcticonSymbol
   * type. Supports custom paths as well as those provided
   * through the static properties of the OcticonSymbol class.
   */
  readonly symbol: OcticonSymbolType

  /**
   * An optional classname that will be appended to the default
   * class name 'octicon'
   */
  readonly className?: string

  /**
   * An optional string to use as a tooltip for the icon
   */
  readonly title?: JSX.Element | string

  readonly tooltipDirection?: TooltipDirection
}

/**
 * A React component for displaying octicon symbols in SVG format.
 *
 * Note that the aspect ratios of the octicons will always be preserved
 * which is why the width and height properties specify the maximum and
 * not the minimum size.
 *
 * Usage: `<Octicon symbol={OcticonSymbol.mark_github} />`
 */
export class Octicon extends React.Component<IOcticonProps, {}> {
  private svgRef = createObservableRef<SVGSVGElement>()

  public render() {
    const { symbol, title, tooltipDirection } = this.props
    const viewBox = `0 0 ${symbol.w} ${symbol.h}`
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
        className={className}
        version="1.1"
        viewBox={viewBox}
        ref={this.svgRef}
        tabIndex={-1}
      >
        {title !== undefined && (
          <Tooltip target={this.svgRef} direction={direction}>
            {title}
          </Tooltip>
        )}
        <path fillRule={symbol.fr} d={symbol.d} />
      </svg>
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
  symbol: OcticonSymbolType,
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
