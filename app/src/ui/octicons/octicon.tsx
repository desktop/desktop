import * as React from 'react'
import { OcticonSymbol } from './octicons.generated'
import * as classNames from 'classnames'
import { createUniqueId, releaseUniqueId } from '../lib/id-pool'

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
  private titleId: string | null = null
  private descriptionId: string | null = null

  public componentWillUnmount() {
    if (this.titleId !== null) {
      releaseUniqueId(this.titleId)
    }
    if (this.descriptionId !== null) {
      releaseUniqueId(this.descriptionId)
    }
  }

  public render() {
    const { symbol, title, description } = this.props
    const viewBox = `0 0 ${symbol.w} ${symbol.h}`
    const className = classNames('octicon', this.props.className)

    let labelledBy = new Array<string>()
    let titleElem: JSX.Element | null = null
    let descriptionElem: JSX.Element | null = null

    if (title && title.length > 0) {
      if (this.titleId === null) {
        this.titleId = createUniqueId('octicon_title')
      }
      labelledBy.push(this.titleId)
      titleElem = <title id={this.titleId}>{title}</title>
    }

    if (description && description.length > 0) {
      if (this.descriptionId === null) {
        this.descriptionId = createUniqueId('octicon_description')
      }
      labelledBy.push(this.descriptionId)
      descriptionElem = <desc id={this.descriptionId}>{description}</desc>
    }

    return (
      <svg
        aria-labelledby={labelledBy.join(' ')}
        className={className}
        version="1.1"
        viewBox={viewBox}
      >
        {titleElem}
        {descriptionElem}
        <path d={symbol.d} />
      </svg>
    )
  }
}
