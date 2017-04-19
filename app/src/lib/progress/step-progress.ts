import { parse, IGitProgress } from './parser'

export interface IProgressStep {
  title: string
  weight: number
}

export interface ICombinedProgress {
  text: string
  percent: number
  step: IProgressStep
  details: IGitProgress
}

export class StepProgress {
  private readonly steps: ReadonlyArray<IProgressStep>
  private readonly callback: (progress: ICombinedProgress) => void
  private readonly stepTotalWeight: number

  private stepIndex = 0
  private currentProgress: ICombinedProgress | null = null

  public constructor(steps: ReadonlyArray<IProgressStep>, callback: (progress: ICombinedProgress) => void) {
    this.steps = steps
    this.callback = callback
    this.stepTotalWeight = steps.reduce((weight, step) => weight += step.weight, 0)
  }

  private updateStep(stepIndex: number, progress: IGitProgress) {
    let percent = 0

    for (let i = 0; i < this.stepIndex; i++) {
      percent += this.steps[i].weight / this.stepTotalWeight
    }

    const step = this.steps[stepIndex]

    if (progress.total) {
      percent += (step.weight / this.stepTotalWeight) + (progress.value / progress.total)
    } else if (this.currentProgress) {
      percent = this.currentProgress.percent
    }

    this.currentProgress = {
      step,
      percent,
      details: progress,
      text: progress.text,
    }

    this.callback(this.currentProgress)
    this.stepIndex = stepIndex
  }

  public parse(line: string) {
    const progress = parse(line)

    if (!progress) {
      return
    }

    for (let i = this.stepIndex; i < this.steps.length; i++) {
      if (progress.title === this.steps[i].title) {
        this.updateStep(i, progress)
      }
    }
  }
}
