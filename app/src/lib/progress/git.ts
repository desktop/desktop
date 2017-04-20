import { parse, IGitProgress } from './parser'

export interface IProgressStep {
  readonly title: string
  readonly weight: number
}

export interface ICombinedProgress {
  readonly kind: 'progress'
  readonly percent: number
  readonly details: IGitProgress
}

export interface IContextOutput {
  readonly kind: 'context'
  readonly percent: number
  readonly text: string
}

export class GitProgressParser {
  private readonly steps: ReadonlyArray<IProgressStep>

  /* The steps listed in should always occur in order but some
   * might not happen at all (like remote compression of objects) so
   * we keep track of the "highest" seen step so that we can fill in
   * progress with the assumption that we've already seen the previous
   * steps.
   */
  private stepIndex = 0

  private lastPercent = 0

  public constructor(steps: ReadonlyArray<IProgressStep>) {

    if (!steps.length) {
      throw new Error('must specify at least one step')
    }

    // Scale the step weight so that they're all a percentage
    // adjusted to the total weight of all steps.
    const totalStepWeight = steps.reduce((sum, step) => sum + step.weight, 0)

    this.steps = steps.map(step => ({
      title: step.title,
      weight: step.weight / totalStepWeight,
    }))
  }

  public parse(line: string): ICombinedProgress | IContextOutput {
    const progress = parse(line)

    if (!progress) {
      return { kind: 'context', text: line, percent: this.lastPercent }
    }

    let percent = 0

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i]

      if (i >= this.stepIndex && progress.title === step.title) {

        if (progress.total) {
          percent += step.weight * (progress.value / progress.total)
        }

        this.stepIndex = i
        this.lastPercent = percent

        return { kind: 'progress', percent, details: progress }
      } else {
        percent += step.weight
      }
    }

    return { kind: 'context', text: line, percent: this.lastPercent }
  }
}
