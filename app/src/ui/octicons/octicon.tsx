import * as React from 'react'
import {
  OcticonSymbolType,
  OcticonSymbolSize,
  OcticonSymbolName,
} from './octicons.generated'
import { CustomOcticonSymbolType } from '.'
import classNames from 'classnames'
import ReactDOM from 'react-dom'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip, TooltipDirection } from '../lib/tooltip'

interface IOcticonProps {
  /**
   * An instance of an object conforming to the OcticonSymbolType
   * or CustomOcticonSymbolType type. Supports custom paths as well as
   * those provided through the static properties of the OcticonSymbol class.
   */
  readonly symbol: OcticonSymbolType | CustomOcticonSymbolType

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

  readonly height?: OcticonSymbolSize
}

/**
 * A React component for displaying octicon symbols in SVG format.
 *
 * Note that the aspect ratios of the octicons will always be preserved
 * which is why the width and height properties specify the maximum and
 * not the minimum size.
 *
 * Usage: `<Octicon symbol={OcticonSymbol.markGithub} />`
 */
export class Octicon extends React.Component<IOcticonProps, {}> {
  private svgRef = createObservableRef<SVGSVGElement>()

  public render() {
    if ((this.props.symbol as CustomOcticonSymbolType).d !== undefined) {
      return this.renderCustomIcon()
    } else {
      return this.renderOcticon()
    }
  }

  private renderOcticon() {
    const height = this.props.height ?? 16
    const symbol = this.props.symbol as OcticonSymbolType

    const naturalHeight = this.closestNaturalHeight(
      Object.keys(symbol.h).map(h =>
        parseInt(h, 10)
      ) as Array<OcticonSymbolSize>,
      height
    )

    const scaledSymbol = symbol.h[naturalHeight]!
    const naturalWidth = scaledSymbol.w
    const width = height * (naturalWidth / naturalHeight)

    return this.renderIcon(symbol.s, height, width, scaledSymbol.p)
  }

  private renderCustomIcon() {
    const symbol = this.props.symbol as CustomOcticonSymbolType
    return this.renderIcon(symbol.s, symbol.h, symbol.w, symbol.d)
  }

  private renderIcon(
    name: OcticonSymbolName | string,
    height: OcticonSymbolSize | number,
    width: number,
    paths: string[]
  ) {
    const { title, tooltipDirection } = this.props
    const viewBox = `0 0 ${width} ${height}`
    const className = classNames(
      'octicon',
      `octicon-${name}`,
      this.props.className
    )

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

  private closestNaturalHeight(
    naturalHeights: Array<OcticonSymbolSize>,
    height?: OcticonSymbolSize
  ) {
    if (height === undefined) {
      return naturalHeights[0]
    }

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
