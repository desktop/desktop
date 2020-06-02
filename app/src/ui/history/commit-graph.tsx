import React = require('react')
import QuickLRU from 'quick-lru'
import { assertNever } from '../../lib/fatal-error'
import { ApplicationTheme } from '../lib/application-theme'

const GraphHeight = 50 * window.devicePixelRatio
const LineSpacing = 10 * window.devicePixelRatio
const LineWidth = 1 * window.devicePixelRatio
const DotWidth = 1 * window.devicePixelRatio

export enum GraphColor {
  Gray,
  Green,
  Purple,
  Yellow,
  Orange,
  Red,
  Pink,
}

export type GraphRow = ReadonlyArray<GraphLine>

export type GraphParent = {
  readonly color: GraphColor
  readonly sha: string
}

export type GraphLine = {
  readonly parents: ReadonlyArray<GraphParent>
  readonly hasCommit: boolean
  readonly hasChildren: boolean
  readonly color: GraphColor
}

type DrawingSpecs = ReadonlyArray<{
  readonly top: {
    readonly color: string
    readonly x: number
  }
  readonly hasTop: boolean
  readonly hasDot: boolean
  readonly bottom: ReadonlyArray<{
    readonly color: string
    readonly x: number
  }>
}>

interface ICommitGraphProps {
  readonly graphRow: GraphRow
  readonly selectedTheme: ApplicationTheme
}

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
          getDrawingSpecsForRow(this.props.graphRow, this.props.selectedTheme),
          graphDimensions
        )}
        height="50"
      />
    )
  }
}

function getDrawingSpecsForRow(
  graphRow: GraphRow,
  selectedTheme: ApplicationTheme
): DrawingSpecs {
  const parents: Array<string> = []

  return graphRow.map((line, num) => {
    const posX = num * LineSpacing + DotWidth * 2

    // Print bottom part of the line.
    const bottom = line.parents.map(parent => {
      let parentIndex = parents.findIndex(el => el === parent.sha)

      if (parentIndex === -1) {
        parentIndex = parents.push(parent.sha) - 1
      }
      return {
        x: getXPosition(parentIndex),
        color: getThemeColor(parent.color, selectedTheme),
      }
    })

    return {
      top: {
        color: getThemeColor(line.color, selectedTheme),
        x: posX,
      },
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

  for (const lineSpecs of drawingSpecs) {
    ctx.strokeStyle = lineSpecs.top.color
    ctx.lineWidth = LineWidth

    // Print top part of the line.
    if (lineSpecs.hasTop) {
      ctx.beginPath()
      ctx.moveTo(lineSpecs.top.x, 0)
      ctx.lineTo(lineSpecs.top.x, GraphHeight / 2)
      ctx.stroke()
    }

    // Print bottom part of the line.
    for (const bottom of lineSpecs.bottom) {
      ctx.strokeStyle = bottom.color
      ctx.beginPath()
      ctx.moveTo(lineSpecs.top.x, GraphHeight / 2)
      ctx.lineTo(bottom.x, GraphHeight)
      ctx.stroke()
    }

    // Print dot indicating commit.
    if (lineSpecs.hasDot) {
      ctx.beginPath()
      ctx.lineWidth = DotWidth * 2
      ctx.arc(lineSpecs.top.x, GraphHeight / 2, DotWidth, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }
}

function getXPosition(index: number) {
  return index * LineSpacing + DotWidth * 2
}

export function getUniqueParents(graphRow: GraphRow): Map<string, GraphParent> {
  return graphRow.reduce((parents, line) => {
    for (const parent of line.parents) {
      if (!parents.has(parent.sha)) {
        parents.set(parent.sha, parent)
      }
    }
    return parents
  }, new Map<string, GraphParent>())
}

function getThemeColor(
  graphColor: GraphColor,
  selectedTheme: ApplicationTheme
): string {
  // Colors from https://primer.style/css/support/color-system
  switch (graphColor) {
    case GraphColor.Gray:
      return selectedTheme === ApplicationTheme.Dark ? '#ccc' : '#24292e'
    case GraphColor.Green:
      return '#28a745'
    case GraphColor.Purple:
      return '#6f42c1'
    case GraphColor.Yellow:
      return '#ffd33d'
    case GraphColor.Orange:
      return '#f66a0a'
    case GraphColor.Red:
      return '#d73a49'
    case GraphColor.Pink:
      return '#ea4aaa'
    default:
      return assertNever(graphColor, 'graphColor not supported')
  }
}

const ColorsOrder = [
  GraphColor.Gray,
  GraphColor.Green,
  GraphColor.Orange,
  GraphColor.Purple,
  GraphColor.Red,
  GraphColor.Pink,
]

export function getNextColor(currentColor: GraphColor | null): GraphColor {
  const index = currentColor !== null ? ColorsOrder.indexOf(currentColor) : -1

  return ColorsOrder[(index + 1) % ColorsOrder.length]
}
