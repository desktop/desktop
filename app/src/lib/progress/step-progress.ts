import { parse, IGitProgress } from './parser'

export interface IProgressStep {
  title: string
  weight: number
}

export interface ICombinedProgress {
  percent: number
  details: IGitProgress
}

export class StepProgress {
  private readonly steps: ReadonlyArray<IProgressStep>
  private readonly callback: (progress: ICombinedProgress) => void

  private stepIndex = 0
  private currentProgress: ICombinedProgress | null = null

  public constructor(steps: ReadonlyArray<IProgressStep>, callback: (progress: ICombinedProgress) => void) {
    const totalStepWeight = steps.reduce((sum, step) => sum + step.weight, 0)

    this.steps = steps.map(step => ({
      title: step.title,
      weight: step.weight / totalStepWeight,
    }))

    this.callback = callback
  }

  private updateStep(stepIndex: number, progress: IGitProgress) {
    let percent = 0

    for (let i = 0; i < this.stepIndex; i++) {
      percent += this.steps[i].weight
    }

    const step = this.steps[stepIndex]

    if (progress.total) {
      const stepProgress = (progress.value / progress.total)
      percent += step.weight * stepProgress
    } else if (this.currentProgress) {
      percent = this.currentProgress.percent
    }

    this.currentProgress = {
      percent,
      details: progress,
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
        return
      }
    }
  }
}
