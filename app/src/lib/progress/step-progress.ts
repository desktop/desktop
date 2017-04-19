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
  private stepIndex = 0

  public constructor(steps: ReadonlyArray<IProgressStep>) {

    // Scale the step weight so that they're all a percentage
    // adjusted to the total weight of all steps.
    const totalStepWeight = steps.reduce((sum, step) => sum + step.weight, 0)

    this.steps = steps.map(step => ({
      title: step.title,
      weight: step.weight / totalStepWeight,
    }))
  }

  public parse(line: string): ICombinedProgress | null {
    const progress = parse(line)

    if (!progress) {
      return null
    }

    let percent = 0

    for (let i = this.stepIndex; i < this.steps.length; i++) {
      const step = this.steps[i]

      if (progress.title === step.title) {

        if (progress.total) {
          percent += step.weight * (progress.value / progress.total)
        }

        this.stepIndex = i

        return { percent, details: progress }
      } else {
        percent += step.weight
      }
    }

    return null
  }
}
