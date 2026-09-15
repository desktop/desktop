import * as React from 'react'

const OUTER_RADIUS = 15
const INNER_RADIUS = 9

interface IPath {
  readonly name: string
  readonly path: string
}

interface IDonut {
  paths: ReadonlyArray<IPath>
  height: number
  width: number
}

interface IDonutProps {
  /**
   * A map of counts where the key is a string to be used as a classname for
   * that segment of the donut in svg such that it can be styled.
   *
   * Example:
   * failure => 5
   * success => 7
   * You could now have a classes defeind of "failure" and "success" to color
   * the segments green and red.
   */
  readonly valueMap: Map<string, number>

  /** Accessible label for the generated donut. Note: If the donut rendering is
   * purely decorative, you can hide it with aria-hiden. */
  readonly ariaLabel?: string
}

/**
 * A component for displaying a donut type pie chart svg
 *
 * Usage: `<DonutSVG donutValues={new Map<string,name>([['failure', 5], ['success', 7]])} />`
 */
export class Donut extends React.Component<IDonutProps, {}> {
  public render() {
    const { valueMap } = this.props
    const { paths, height, width } = buildDonutSVGData(valueMap)
    const viewBox = `0 0 ${width} ${height}`

    const svgPaths = paths.map((p, i) => {
      return <path key={i} className={p.name} d={p.path} />
    })

    return (
      <svg
        aria-label={this.props.ariaLabel}
        className="donut"
        version="1.1"
        viewBox={viewBox}
        tabIndex={-1}
      >
        {svgPaths}
      </svg>
    )
  }
}

function buildDonutSVGData(
  donutValuesMap: Map<string, number>,
  outerRadius: number = OUTER_RADIUS,
  innerRadius: number = INNER_RADIUS
): IDonut {
  const diameter = outerRadius * 2
  const sum = [...donutValuesMap.values()].reduce((sum, v) => sum + v)

  const cx = diameter / 2
  const cy = cx

  const paths: IPath[] = []
  let cumulative = 0

  for (const [name, value] of [...donutValuesMap.entries()]) {
    if (value === 0) {
      continue
    }

    const portion = value / sum

    if (portion === 1) {
      const x2 = cx - 0.01
      const y1 = cy - outerRadius
      const y2 = cy - innerRadius
      const d = ['M', cx, y1]
      d.push('A', outerRadius, outerRadius, 0, 1, 1, x2, y1)
      d.push('L', x2, y2)
      d.push('A', innerRadius, innerRadius, 0, 1, 0, cx, y2)
      paths.push({ name, path: d.join(' ') })
      continue
    }

    const cumulative_plus_value = cumulative + value

    const d = ['M', ...scale(cumulative, outerRadius, cx, sum)]
    d.push('A', outerRadius, outerRadius, 0)
    d.push(portion > 0.5 ? 1 : 0)
    d.push(1)
    d.push(...scale(cumulative_plus_value, outerRadius, cx, sum))
    d.push('L')

    d.push(...scale(cumulative_plus_value, innerRadius, cx, sum))
    d.push('A', innerRadius, innerRadius, 0)
    d.push(portion > 0.5 ? 1 : 0)
    d.push(0)
    d.push(...scale(cumulative, innerRadius, cx, sum))

    cumulative += value

    paths.push({ name, path: d.join(' ') })
  }

  return {
    paths,
    height: diameter,
    width: diameter,
  }
}

function scale(
  value: number,
  radius: number,
  cxy: number,
  sum: number
): ReadonlyArray<number> {
  const radians = (value / sum) * Math.PI * 2 - Math.PI / 2
  return [radius * Math.cos(radians) + cxy, radius * Math.sin(radians) + cxy]
}
