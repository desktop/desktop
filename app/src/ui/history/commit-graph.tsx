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

class Node {
  public sha: string = ''
  public isLeft: boolean = true
  public parentSHAs: string[] = []
}

class NodePos {
  public x: number = 0
  public y: number = 1
}

export class CommitGraph extends React.Component<
  ICommitGraphProps,
  ICommitGraphState
> {
  private canvas: HTMLCanvasElement | null = null
  private nodeList: Array<Node> = []
  private nodeMap: Map<string, Node> = new Map<string, Node>()
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
    x: number,
    y: number,
    top: boolean
  ) {
    if (top) {
      if (y - prevPos.y > this.props.height * 1.1) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, prevPos.y + this.props.height)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(x, prevPos.y + this.props.height)
      ctx.bezierCurveTo(
        x,
        prevPos.y + this.props.height * 0.3,
        prevPos.x,
        prevPos.y + this.props.height * 0.7,
        prevPos.x,
        prevPos.y
      )
      ctx.stroke()
    } else {
      if (y - prevPos.y > this.props.height * 1.1) {
        ctx.beginPath()
        ctx.moveTo(prevPos.x, prevPos.y)
        ctx.lineTo(prevPos.x, y - this.props.height)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(prevPos.x, y - this.props.height)
      ctx.bezierCurveTo(
        prevPos.x,
        y - this.props.height * 0.3,
        x,
        y - this.props.height * 0.7,
        x,
        y
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
        const positionMap = new Map<string, NodePos[]>()
        let beforeIsLeft = false
        for (let i = 0; i < this.nodeList.length; ++i) {
          const node = this.nodeList[i]
          let x = this.apartX
          const y = this.props.height / 2 + i * this.props.height
          if (!node.isLeft) {
            x += this.apartX
          }
          node.parentSHAs.forEach(sha => {
            const parentNode = this.nodeMap.get(sha)
            if (parentNode !== undefined) {
              const nodePos = new NodePos()
              nodePos.x = x
              nodePos.y = y
              let posList = positionMap.get(sha)
              if (posList === undefined) {
                posList = []
                positionMap.set(sha, posList)
              }
              posList.push(nodePos)
            }
          })
          const prevPosList = positionMap.get(node.sha)
          if (prevPosList !== undefined) {
            prevPosList.forEach(prevPos => {
              if (prevPos.x !== x) {
                if (prevPos.x < x) {
                  if (beforeIsLeft) {
                    this.drawBezier(ctx, prevPos, x, y, true)
                  } else {
                    this.drawBezier(ctx, prevPos, x, y, false)
                  }
                } else {
                  if (beforeIsLeft) {
                    this.drawBezier(ctx, prevPos, x, y, false)
                  } else {
                    this.drawBezier(ctx, prevPos, x, y, true)
                  }
                }
              } else {
                ctx.beginPath()
                ctx.moveTo(prevPos.x, prevPos.y)
                ctx.lineTo(x, y)
                ctx.stroke()
              }
            })
          }
          beforeIsLeft = node.isLeft
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
          let x = this.apartX
          const y = this.props.height / 2 + i * this.props.height
          if (!node.isLeft) {
            x += this.apartX
          }
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
    }
  }
}
