import * as React from 'react'
import { Commit } from '../../models/commit'
import { IGraphNode, IGraphEdge } from '../../lib/graph/layout'

/** Width of each lane column, in CSS pixels. */
export const LANE_WIDTH = 14

/** Height of one row, in CSS pixels. */
export const ROW_HEIGHT = 50

/** Radius of the commit dot. */
const DOT_RADIUS = 4

/** Stroke width of edge lines. */
const STROKE_WIDTH = 1.5

interface IGraphRowProps {
  readonly commit: Commit
  readonly node: IGraphNode
  /** Maximum lane index across the whole graph (controls SVG width). */
  readonly maxLane: number
}

export class GraphRow extends React.PureComponent<IGraphRowProps> {
  public render() {
    const { commit, maxLane } = this.props
    const width = (maxLane + 1) * LANE_WIDTH
    const refs = parseRefs(commit)

    return (
      <div className="graph-row">
        <svg
          className="graph-lanes"
          width={width}
          height={ROW_HEIGHT}
          aria-hidden="true"
        >
          {this.renderEdges()}
          {this.renderDot()}
        </svg>
        <div className="graph-row-content">
          <div className="graph-row-summary">
            {refs.length > 0 && (
              <span className="graph-row-refs">
                {refs.map((ref, i) => (
                  <span
                    key={`${ref.label}-${i}`}
                    className={`graph-row-ref graph-row-ref-${ref.kind}`}
                    title={ref.label}
                  >
                    {ref.label}
                  </span>
                ))}
              </span>
            )}
            <span className="graph-row-message" title={commit.summary}>
              {commit.summary}
            </span>
          </div>
          <div className="graph-row-meta">
            <span className="graph-row-author">{commit.author.name}</span>
            <span className="graph-row-sha">{commit.shortSha}</span>
          </div>
        </div>
      </div>
    )
  }

  private renderDot() {
    const cx = laneX(this.props.node.lane)
    const cy = ROW_HEIGHT / 2
    return (
      <circle
        className={`graph-dot graph-color-${
          this.props.node.lane % PALETTE_SIZE
        }`}
        cx={cx}
        cy={cy}
        r={DOT_RADIUS}
      />
    )
  }

  private renderEdges() {
    const elements: JSX.Element[] = []

    for (let i = 0; i < this.props.node.edges.length; i++) {
      const edge = this.props.node.edges[i]
      let y0: number
      let y1: number
      switch (edge.kind) {
        case 'top-half':
          y0 = 0
          y1 = ROW_HEIGHT / 2
          break
        case 'bottom-half':
          y0 = ROW_HEIGHT / 2
          y1 = ROW_HEIGHT
          break
        case 'through':
          y0 = 0
          y1 = ROW_HEIGHT
          break
      }
      elements.push(renderEdgeSegment(`e-${i}`, edge, y0, y1))
    }

    return elements
  }
}

function renderEdgeSegment(
  key: string,
  edge: IGraphEdge,
  y0: number,
  y1: number
) {
  const x0 = laneX(edge.fromLane)
  const x1 = laneX(edge.toLane)
  const colorClass = `graph-color-${edge.colorIndex % PALETTE_SIZE}`

  // For diagonals, use a smooth cubic Bezier so merges/forks look curvy.
  if (x0 === x1) {
    return (
      <line
        key={key}
        className={`graph-edge ${colorClass}`}
        x1={x0}
        y1={y0}
        x2={x1}
        y2={y1}
        strokeWidth={STROKE_WIDTH}
      />
    )
  }

  const midY = (y0 + y1) / 2
  const d = `M ${x0} ${y0} C ${x0} ${midY}, ${x1} ${midY}, ${x1} ${y1}`
  return (
    <path
      key={key}
      className={`graph-edge ${colorClass}`}
      d={d}
      strokeWidth={STROKE_WIDTH}
      fill="none"
    />
  )
}

function laneX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2
}

/** Number of distinct lane colors in the SCSS palette. */
const PALETTE_SIZE = 8

interface IRefLabel {
  readonly kind: 'head' | 'local' | 'remote' | 'tag'
  readonly label: string
}

function parseRefs(commit: Commit): ReadonlyArray<IRefLabel> {
  const refs: IRefLabel[] = []

  // Tags are already parsed onto Commit.tags. Add them as 'tag' refs.
  for (const tag of commit.tags) {
    refs.push({ kind: 'tag', label: tag })
  }

  return refs
}
