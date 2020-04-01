import * as React from 'react'
interface ICommitGraphProps {}

interface ICommitGraphState {}

export class CommitGraph extends React.Component<
  ICommitGraphProps,
  ICommitGraphState
> {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  public constructor(props: ICommitGraphProps) {
    super(props)
    this.state = {
      focusedBranch: null,
      hasConsumedNotification: false,
    }
  }

  public render() {
    return <canvas ref={this.refCanvas} />
  }

  private refCanvas = (canvas: HTMLCanvasElement) => {
    this.canvas = canvas
    this.draw(0)
  }

  public draw(scrollTop: number) {
    if (this.canvas != null) {
      this.canvas.width = this.canvas.clientWidth
      this.canvas.height = this.canvas.clientHeight
      this.ctx = this.canvas.getContext('2d')
      if (this.ctx != null) {
        this.ctx.fillStyle = 'rgb(200,0,0)'
        this.ctx.fillRect(10, 10 - scrollTop, 50, 50)

        this.ctx.fillStyle = 'rgba(0, 0, 200, 0.5)'
        this.ctx.fillRect(30, 30 - scrollTop, 50, 50)

        //this.ctx.bezierCurveTo()
      }
    }
  }
}
