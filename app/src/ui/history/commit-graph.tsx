import * as React from 'react'
import { Commit } from '../../models/commit'
import { OcticonSymbol } from '../octicons'
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

enum NodeIcon {
  NORMAL,
  HEAD,
  MERGE,
  BRANCH,
}

class Node {
  public sha: string = ''
  public isLeft: boolean = true
  public parentSHAs: string[] = []
  public nodePos: NodePos = new NodePos()
  public icon: NodeIcon = NodeIcon.NORMAL
}

class Link {
  public start: Node | null = null
  public end: Node | null = null
  public isBezier: boolean = false
  public bezierTop: boolean = false
}

const APART_X = 15

export class CommitGraph extends React.Component<
  ICommitGraphProps,
  ICommitGraphState
> {
  private canvas: HTMLCanvasElement | null = null
  private nodeList: Array<Node> = []
  private nodeMap: Map<string, Node> = new Map<string, Node>()
  private linkList: Array<Link> = []
  private strokeColor: string = ''
  private backgroundColor: string = ''

  public constructor(props: ICommitGraphProps) {
    super(props)
    this.state = {
      focusedBranch: null,
      hasConsumedNotification: false,
    }
    if (getPersistedTheme() === ApplicationTheme.Light) {
      this.backgroundColor = '#FFFFFF'
      this.strokeColor = '#959da5'
    } else {
      this.backgroundColor = '#24292e'
      this.strokeColor = '#6a737d'
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
      let x = APART_X
      const y = this.props.height / 2 + i * this.props.height
      if (!node.isLeft) {
        x += APART_X
      }
      node.nodePos.x = x
      node.nodePos.y = y
      if (node.parentSHAs.length > 1) {
        node.icon = NodeIcon.MERGE
      }
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
        if (prevPosList.length > 1) {
          node.icon = NodeIcon.BRANCH
        }
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
    for (const node of this.nodeList) {
      if (node.sha === this.props.currentBranch.tip.sha) {
        node.icon = NodeIcon.HEAD
        break
      }
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
    top: boolean,
    cutPrev: number = 0,
    cutCur: number = 0
  ) {
    if (top) {
      if (curPos.y - prevPos.y > this.props.height * 1.1) {
        ctx.beginPath()
        ctx.moveTo(curPos.x, curPos.y - cutCur)
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
        prevPos.y + cutPrev
      )
      ctx.stroke()
    } else {
      if (curPos.y - prevPos.y > this.props.height * 1.1) {
        ctx.beginPath()
        ctx.moveTo(prevPos.x, prevPos.y + cutPrev)
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
        curPos.y - cutCur
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
        ctx.fillStyle = this.backgroundColor
        ctx.strokeStyle = this.strokeColor
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
              link.bezierTop,
              this.getCutOff(link.start.icon, true),
              this.getCutOff(link.end.icon, false)
            )
          } else {
            ctx.beginPath()
            ctx.moveTo(
              link.start.nodePos.x,
              link.start.nodePos.y + this.getCutOff(link.start.icon, true)
            )
            ctx.lineTo(
              link.end.nodePos.x,
              link.end.nodePos.y - this.getCutOff(link.end.icon, false)
            )
            ctx.stroke()
          }
        }

        for (let i = 0; i < this.nodeList.length; ++i) {
          const node = this.nodeList[i]
          this.setStyle(ctx, node.icon)
          switch (node.icon) {
            case NodeIcon.NORMAL:
              ctx.beginPath()
              ctx.arc(node.nodePos.x, node.nodePos.y, 4, 0, Math.PI * 2)
              ctx.fill()
              ctx.stroke()
              break
            case NodeIcon.HEAD:
              ctx.beginPath()
              ctx.arc(node.nodePos.x, node.nodePos.y, 5, 0, Math.PI * 2)
              ctx.fill()
              ctx.stroke()
              break
            case NodeIcon.MERGE:
              ctx.save()
              ctx.translate(
                node.nodePos.x - OcticonSymbol.gitMerge.w / 2,
                node.nodePos.y - OcticonSymbol.gitMerge.h / 2
              )
              const pathMerge = new Path2D(OcticonSymbol.gitMerge.d)
              ctx.stroke(pathMerge)
              ctx.restore()
              break
            case NodeIcon.BRANCH:
              ctx.save()
              ctx.translate(
                node.nodePos.x - OcticonSymbol.gitBranch.w / 2,
                node.nodePos.y - OcticonSymbol.gitBranch.h / 2
              )
              const pathBranch = new Path2D(OcticonSymbol.gitBranch.d)
              ctx.stroke(pathBranch)
              ctx.restore()
              break
          }
        }
      }
    }
  }

  private getCutOff(icon: NodeIcon, isStart: boolean): number {
    switch (icon) {
      case NodeIcon.BRANCH:
        if (isStart) {
          return 7
        } else {
          return 7
        }
      case NodeIcon.MERGE:
        if (isStart) {
          return 4
        } else {
          return 3
        }
    }
    return 0
  }

  private setStyle(ctx: CanvasRenderingContext2D, icon: NodeIcon) {
    switch (icon) {
      case NodeIcon.NORMAL:
        ctx.lineWidth = 1
        ctx.fillStyle = this.strokeColor
        ctx.strokeStyle = this.backgroundColor
        break
      case NodeIcon.HEAD:
        ctx.lineWidth = 3
        ctx.fillStyle = this.backgroundColor
        ctx.strokeStyle = this.strokeColor
        break
      default:
        ctx.lineWidth = 1
        ctx.fillStyle = this.backgroundColor
        ctx.strokeStyle = this.strokeColor
    }
  }
}
