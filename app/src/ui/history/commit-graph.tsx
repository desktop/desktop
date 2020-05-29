import React = require('react')

const GraphHeight = 50
const LineSpacing = 10
const LineWidth = 2
const DotWidth = 2

export enum GraphColor {
  Red = 'red',
  Yellow = 'yellow',
  Green = 'green',
  Black = 'black',
  Blue = 'blue',
  Gray = '#ccc',
}

export type GraphRow = ReadonlyArray<GraphLine>

export type GraphLine = {
  parents: ReadonlyArray<string>
  hasCommit: boolean
  hasChildren: boolean
  color: GraphColor
}

interface ICommitGraphProps {
  readonly graphRow: GraphRow
}

/** A component which displays a single commit in a commit list. */
export class CommitGraph extends React.PureComponent<ICommitGraphProps> {
  private canvas: React.RefObject<HTMLCanvasElement> = React.createRef()

  public render() {
    const numLinesBefore = this.props.graphRow.length
    const numLinesAfter = getUniqueParents(this.props.graphRow).size

    const numLines = Math.max(numLinesBefore, numLinesAfter)

    return (
      <canvas
        ref={this.canvas}
        width={numLines * LineSpacing}
        height={GraphHeight}
      />
    )
  }

  public componentDidMount() {
    if (this.canvas.current === null) {
      return
    }

    drawGraphRowInCanvas(this.canvas.current, this.props.graphRow)
  }
}

function drawGraphRowInCanvas(canvas: HTMLCanvasElement, graphRow: GraphRow) {
  canvas.width = canvas.clientWidth
  canvas.height = canvas.clientHeight
  const ctx = canvas.getContext('2d')

  if (ctx === null) {
    return
  }

  ctx.lineWidth = LineWidth
  const parents: Array<string> = []

  for (const [num, line] of graphRow.entries()) {
    const posX = num * LineSpacing + DotWidth * 2
    ctx.strokeStyle = line.color

    // Print top part of the line.
    if (line.hasChildren) {
      ctx.strokeStyle = line.color
      ctx.beginPath()
      ctx.moveTo(posX, 0)
      ctx.lineTo(posX, GraphHeight / 2)
      ctx.stroke()
    }

    // Print dot indicating commit.
    if (line.hasCommit) {
      ctx.strokeStyle = line.color
      ctx.beginPath()
      ctx.arc(posX, GraphHeight / 2, DotWidth, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // Print bottom part of the line.
    for (const parent of line.parents) {
      let parentIndex = parents.findIndex(el => el === parent)

      if (parentIndex === -1) {
        parentIndex = parents.push(parent) - 1
      }
      const finalPositionX = getXPosition(parentIndex)

      ctx.strokeStyle = line.color
      ctx.beginPath()
      ctx.moveTo(posX, GraphHeight / 2)
      ctx.lineTo(finalPositionX, GraphHeight)
      ctx.stroke()
    }
  }
}

function getXPosition(index: number) {
  return index * LineSpacing + DotWidth * 2
}

export function getUniqueParents(graphRow: GraphRow): Set<string> {
  return graphRow.reduce((parents, line) => {
    for (const parent of line.parents) {
      parents.add(parent)
    }
    return parents
  }, new Set<string>())
}
