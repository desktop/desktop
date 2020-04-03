import * as React from 'react'
import { Commit } from '../../models/commit'
//import { OcticonSymbol } from '../octicons'
import { Branch } from '../../models/branch'
import { getPersistedTheme, ApplicationTheme } from '../lib/application-theme'

interface ICommitGraphProps {
  readonly commitSHAs: ReadonlyArray<string>
  readonly commitLookup: Map<string, Commit>
  readonly currentBranch: Branch
  readonly compareBranch: Branch
  readonly height: number
}

interface ICommitGraphState {}

class NodePos {
  public x: number = 0
  public y: number = 0
}

class Node {
  public sha: string = ''
  public isLeft: boolean = true
  public parentSHAs: string[] = []
  public nodePos: NodePos = new NodePos()
}

class Link {
  public start: Node | null = null
  public end: Node | null = null
  public isBezier: boolean = false
  public bezierTop: boolean = false
}

export class CommitGraph extends React.Component<
  ICommitGraphProps,
  ICommitGraphState
> {
  private canvas: HTMLCanvasElement | null = null
  private nodeList: Array<Node> = []
  private nodeMap: Map<string, Node> = new Map<string, Node>()
  private linkList: Array<Link> = []
  private apartX = 15

  public constructor(props: ICommitGraphProps) {
    super(props)
    this.state = {
      focusedBranch: null,
      hasConsumedNotification: false,
    }

    let currentCommit: Commit | undefined = this.props.currentBranch.tip
    let compareCommit: Commit | undefined = this.props.compareBranch.tip
    for (let i = 0; i < this.props.commitSHAs.length; ++i) {
      const commit = this.props.commitLookup.get(this.props.commitSHAs[i])
      if (commit === undefined) {
        continue
      }
      const node = new Node()
      node.sha = commit.sha
      commit.parentSHAs.forEach(sha => node.parentSHAs.push(sha))
      this.nodeList.push(node)
      this.nodeMap.set(commit.sha, node)
      if (currentCommit !== undefined && commit.sha === currentCommit.sha) {
        node.isLeft = true
        currentCommit = this.props.commitLookup.get(commit.parentSHAs[0])
      } else if (
        compareCommit !== undefined &&
        commit.sha === compareCommit.sha
      ) {
        node.isLeft = false
        compareCommit = this.props.commitLookup.get(commit.parentSHAs[0])
      }
    }

    const positionMap = new Map<string, Node[]>()
    let beforeIsLeft = false
    for (let i = 0; i < this.nodeList.length; ++i) {
      const node = this.nodeList[i]
      let x = this.apartX
      const y = this.props.height / 2 + i * this.props.height
      if (!node.isLeft) {
        x += this.apartX
      }
      node.nodePos.x = x
      node.nodePos.y = y
      node.parentSHAs.forEach(sha => {
        const parentNode = this.nodeMap.get(sha)
        if (parentNode !== undefined) {
          let posList = positionMap.get(sha)
          if (posList === undefined) {
            posList = []
            positionMap.set(sha, posList)
          }
          posList.push(node)
        }
      })
      const prevPosList = positionMap.get(node.sha)
      if (prevPosList !== undefined) {
        prevPosList.forEach(prevNode => {
          const link = new Link()
          link.start = prevNode
          link.end = node
          const prevPos = prevNode.nodePos
          if (prevPos.x !== x) {
            link.isBezier = true
            link.bezierTop =
              (prevPos.x < x && beforeIsLeft) ||
              (prevPos.x >= x && !beforeIsLeft)
          } else {
            link.isBezier = false
          }
          this.linkList.push(link)
        })
      }
      beforeIsLeft = node.isLeft
    }
  }

  public render() {
    return <canvas ref={this.refCanvas} />
  }

  private refCanvas = (canvas: HTMLCanvasElement) => {
    this.canvas = canvas
    this.draw(0)
  }

  private drawBezier(
    ctx: CanvasRenderingContext2D,
    prevPos: NodePos,
    curPos: NodePos,
    top: boolean
  ) {
    if (top) {
      if (curPos.y - prevPos.y > this.props.height * 1.1) {
        ctx.beginPath()
        ctx.moveTo(curPos.x, curPos.y)
        ctx.lineTo(curPos.x, prevPos.y + this.props.height)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(curPos.x, prevPos.y + this.props.height)
      ctx.bezierCurveTo(
        curPos.x,
        prevPos.y + this.props.height * 0.3,
        prevPos.x,
        prevPos.y + this.props.height * 0.7,
        prevPos.x,
        prevPos.y
      )
      ctx.stroke()
    } else {
      if (curPos.y - prevPos.y > this.props.height * 1.1) {
        ctx.beginPath()
        ctx.moveTo(prevPos.x, prevPos.y)
        ctx.lineTo(prevPos.x, curPos.y - this.props.height)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(prevPos.x, curPos.y - this.props.height)
      ctx.bezierCurveTo(
        prevPos.x,
        curPos.y - this.props.height * 0.3,
        curPos.x,
        curPos.y - this.props.height * 0.7,
        curPos.x,
        curPos.y
      )
      ctx.stroke()
    }
  }

  public draw(scrollTop: number) {
    if (this.canvas != null) {
      this.canvas.width = this.canvas.clientWidth
      this.canvas.height = this.canvas.clientHeight
      const ctx = this.canvas.getContext('2d')
      if (ctx != null) {
        ctx.translate(0, -scrollTop)
        if (getPersistedTheme() === ApplicationTheme.Light) {
          ctx.fillStyle = 'rgb(255,255,255)'
          ctx.strokeStyle = 'rgb(170,170,170)'
        } else {
          ctx.fillStyle = '#24292e'
          ctx.strokeStyle = '#586069'
        }
        ctx.lineWidth = 2
        for (let i = 0; i < this.linkList.length; ++i) {
          const link = this.linkList[i]
          if (link.start == null || link.end == null) {
            continue
          }
          if (link.isBezier) {
            this.drawBezier(
              ctx,
              link.start.nodePos,
              link.end.nodePos,
              link.bezierTop
            )
          } else {
            ctx.beginPath()
            ctx.moveTo(link.start.nodePos.x, link.start.nodePos.y)
            ctx.lineTo(link.end.nodePos.x, link.end.nodePos.y)
            ctx.stroke()
          }
          /*ctx.save()
					ctx.translate(x, y)
          const path = new Path2D(OcticonSymbol.mail.d)
          ctx.stroke(path)
          ctx.restore()*/
        }

        if (getPersistedTheme() === ApplicationTheme.Light) {
          ctx.fillStyle = 'rgb(170,170,170)'
          ctx.strokeStyle = 'rgb(255,255,255)'
        } else {
          ctx.fillStyle = '#586069'
          ctx.strokeStyle = '#24292e'
        }
        ctx.lineWidth = 1
        for (let i = 0; i < this.nodeList.length; ++i) {
          const node = this.nodeList[i]
          ctx.beginPath()
          ctx.arc(node.nodePos.x, node.nodePos.y, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
    }
  }
}
