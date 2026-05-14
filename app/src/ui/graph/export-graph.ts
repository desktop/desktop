import { Commit } from '../../models/commit'
import { IGraphLayout, IGraphEdge } from '../../lib/graph/layout'
import { LANE_WIDTH, ROW_HEIGHT } from './graph-row'

/** Same 8-colour palette as `app/styles/ui/_graph.scss`. */
const PALETTE = [
  '#58a6ff',
  '#f778ba',
  '#d2a8ff',
  '#7ee787',
  '#ffa657',
  '#f0883e',
  '#79c0ff',
  '#ff7b72',
]

const TEXT_GUTTER = 12
const TEXT_COLUMN_WIDTH = 720
const FONT_SIZE = 12

interface IExportOptions {
  readonly background: string
  readonly textColor: string
  readonly secondaryTextColor: string
}

/**
 * Render the full graph (every loaded commit, not just the visible viewport)
 * as a single SVG string. Coordinates and palette match the live renderer so
 * the export is faithful to what the user sees on screen.
 */
export function renderGraphToSvg(
  commits: ReadonlyArray<Commit>,
  layout: IGraphLayout,
  options: IExportOptions
): { svg: string; width: number; height: number } {
  const graphWidth = (layout.maxLane + 1) * LANE_WIDTH
  const width = graphWidth + TEXT_COLUMN_WIDTH
  const height = commits.length * ROW_HEIGHT

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="geometricPrecision">`
  )
  parts.push(
    `<rect width="100%" height="100%" fill="${escapeXml(options.background)}"/>`
  )

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    const node = layout.nodes[i]
    if (!commit || !node) {
      continue
    }
    const yOffset = i * ROW_HEIGHT

    for (const edge of node.edges) {
      parts.push(renderEdgeSvg(edge, yOffset))
    }

    const dotColor = colorForLane(node)
    const cx = laneCenterX(node.lane)
    const cy = yOffset + ROW_HEIGHT / 2
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="4" fill="${dotColor}" stroke="${dotColor}" stroke-width="2"/>`
    )

    const textX = graphWidth + TEXT_GUTTER
    const baselineY = yOffset + ROW_HEIGHT / 2 + FONT_SIZE / 2 - 2
    const meta = `${commit.shortSha}  ${commit.author.name}`
    parts.push(
      `<text x="${textX}" y="${baselineY}" fill="${escapeXml(
        options.textColor
      )}" font-family="sans-serif" font-size="${FONT_SIZE}" font-weight="500">${escapeXml(
        truncate(commit.summary, 80)
      )}</text>`
    )
    parts.push(
      `<text x="${textX}" y="${baselineY + FONT_SIZE + 2}" fill="${escapeXml(
        options.secondaryTextColor
      )}" font-family="sans-serif" font-size="${FONT_SIZE - 2}">${escapeXml(
        meta
      )}</text>`
    )
  }

  parts.push('</svg>')
  return { svg: parts.join('\n'), width, height }
}

/**
 * Rasterise an SVG string to PNG bytes via an offscreen `<canvas>`. Only
 * works in the renderer process (relies on the DOM `Image` element).
 */
export async function svgToPngBytes(
  svg: string,
  width: number,
  height: number
): Promise<Uint8Array> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.width = width
    img.height = height
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () =>
        reject(new Error('Failed to load the generated SVG into an Image'))
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      throw new Error('Could not obtain a 2D canvas context')
    }
    ctx.drawImage(img, 0, 0, width, height)

    const pngBlob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/png')
    )
    if (pngBlob === null) {
      throw new Error('canvas.toBlob returned null')
    }
    const buf = await pngBlob.arrayBuffer()
    return new Uint8Array(buf)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function renderEdgeSvg(edge: IGraphEdge, yOffset: number): string {
  const x0 = laneCenterX(edge.fromLane)
  const x1 = laneCenterX(edge.toLane)
  let y0: number
  let y1: number
  switch (edge.kind) {
    case 'top-half':
      y0 = yOffset
      y1 = yOffset + ROW_HEIGHT / 2
      break
    case 'bottom-half':
      y0 = yOffset + ROW_HEIGHT / 2
      y1 = yOffset + ROW_HEIGHT
      break
    case 'through':
      y0 = yOffset
      y1 = yOffset + ROW_HEIGHT
      break
  }
  const color = PALETTE[edge.colorIndex % PALETTE.length]
  if (x0 === x1) {
    return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${color}" stroke-width="1.5"/>`
  }
  const midY = (y0 + y1) / 2
  return `<path d="M ${x0} ${y0} C ${x0} ${midY}, ${x1} ${midY}, ${x1} ${y1}" stroke="${color}" stroke-width="1.5" fill="none"/>`
}

function laneCenterX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2
}

function colorForLane(node: {
  lane: number
  edges: ReadonlyArray<IGraphEdge>
}): string {
  for (const edge of node.edges) {
    if (edge.fromLane === node.lane || edge.toLane === node.lane) {
      return PALETTE[edge.colorIndex % PALETTE.length]
    }
  }
  return PALETTE[node.lane % PALETTE.length]
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s
  }
  return s.slice(0, max - 1) + '…'
}
