import React = require('react')
import QuickLRU from 'quick-lru'

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

type DrawingSpecs = ReadonlyArray<{
  color: GraphColor
  x: number
  hasTop: boolean
  hasDot: boolean
  bottom: ReadonlyArray<number>
}>

/** A component which displays a single commit in a commit list. */
export class CommitGraph extends React.PureComponent<ICommitGraphProps> {
  public render() {
    const numLinesBefore = this.props.graphRow.length
    const numLinesAfter = getUniqueParents(this.props.graphRow).size
    const numLines = Math.max(numLinesBefore, numLinesAfter)

    const graphDimensions = {
      width: numLines * LineSpacing,
      height: GraphHeight,
    }

    return (
      <img
        src={getGraphRowImg(
          getDrawingSpecsForRow(this.props.graphRow),
          graphDimensions
        )}
        width={graphDimensions.width}
        height={graphDimensions.height}
      />
    )
  }
}

function getDrawingSpecsForRow(graphRow: GraphRow): DrawingSpecs {
  const parents: Array<string> = []

  return graphRow.map((line, num) => {
    const posX = num * LineSpacing + DotWidth * 2

    // Print bottom part of the line.
    const bottom = line.parents.map(parent => {
      let parentIndex = parents.findIndex(el => el === parent)

      if (parentIndex === -1) {
        parentIndex = parents.push(parent) - 1
      }
      return getXPosition(parentIndex)
    })

    return {
      color: line.color,
      x: posX,
      hasTop: line.hasChildren,
      hasDot: line.hasCommit,
      bottom,
    }
  })
}

const cache = new QuickLRU<string, string>({
  maxSize: 250,
})
let numHits = 0
let numMisses = 0

function getGraphRowImg(
  drawingSpecs: DrawingSpecs,
  { width, height }: { width: number; height: number }
): string {
  const key = JSON.stringify(drawingSpecs)

  if ((numHits + numMisses) % 20 === 0) {
    console.log(
      'rafeca: cache hit ratio - ',
      (numHits / (numHits + numMisses)) * 100
    )
  }

  const cachedImg = cache.get(key)
  if (cachedImg !== undefined) {
    numHits++
    return cachedImg
  } else {
    numMisses++
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  drawGraphRowInCanvas(canvas, drawingSpecs)

  const img = canvas.toDataURL()
  cache.set(key, img)

  return img
}

function drawGraphRowInCanvas(
  canvas: HTMLCanvasElement,
  drawingSpecs: DrawingSpecs
) {
  const ctx = canvas.getContext('2d')

  if (ctx === null) {
    return
  }

  ctx.lineWidth = LineWidth

  for (const lineSpecs of drawingSpecs) {
    ctx.strokeStyle = lineSpecs.color

    // Print top part of the line.
    if (lineSpecs.hasTop) {
      ctx.beginPath()
      ctx.moveTo(lineSpecs.x, 0)
      ctx.lineTo(lineSpecs.x, GraphHeight / 2)
      ctx.stroke()
    }

    // Print dot indicating commit.
    if (lineSpecs.hasDot) {
      ctx.beginPath()
      ctx.arc(lineSpecs.x, GraphHeight / 2, DotWidth, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // Print bottom part of the line.
    for (const finalPositionX of lineSpecs.bottom) {
      ctx.beginPath()
      ctx.moveTo(lineSpecs.x, GraphHeight / 2)
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
