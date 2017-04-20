import { Progress } from './events'
import { Emitter, Disposable } from 'event-kit'

class GenericOperationProgress<T extends Progress> {

  private emitter: Emitter = new Emitter()
  private readonly steps = new Array<OperationStep<Progress>>()
  private readonly map: (progress: Progress) => T

  /* The steps listed in should always occur in order but some
   * might not happen at all (like remote compression of objects) so
   * we keep track of the "highest" seen step so that we can fill in
   * progress with the assumption that we've already seen the previous
   * steps.
   */
  private currentStepIndex = 0

  public constructor(map: (progress: Progress) => T) {
    this.map = map
  }

  public onProgress(handler: (progress: T) => void): Disposable {
    return this.emitter.on('progress', handler)
  }

  private addProgress(stepIndex: number, progress: Progress) {

    if (stepIndex < this.currentStepIndex) {
      return
    }

    let totalProgress = 0
    const scaleSum = this.steps.reduce((sum, step) => sum + step.scale, 0)

    for (let i = 0; i < this.steps.length && scaleSum > 0; i++) {
      const scale = this.steps[i].scale / scaleSum

      if (i >= this.currentStepIndex) {
        totalProgress += progress.progressValue * scale
        this.currentStepIndex = i
      } else {
        totalProgress += scale
      }
    }

    return this.map({ ...progress, progressValue: totalProgress })
  }

  public withTransform<TOut extends Progress>(map: (progress: Progress) => TOut): GenericOperationProgress<TOut> {
    return new GenericOperationProgress<TOut>(map)
  }

  public addStep<P extends Progress>(scale: number): OperationStep<P> {
    const stepIndex = this.steps.length
    const step = new OperationStep<P>(scale, (progress) => this.addProgress(stepIndex, progress))
    this.steps.push(step)

    return step
  }
}

export class OperationProgress extends GenericOperationProgress<Progress> {
  public constructor() {
    super(p => p)
  }
}

class OperationStep<TIn extends Progress> {
  public readonly scale: number
  public addProgress: (progress: TIn) => void

  public constructor(scale: number, parentAdd: (progress: TIn) => void, map?: (progress: TIn) => Progress) {
    this.scale = scale
    this.addProgress = parentAdd
  }

  public withTitle(title: string | ((progress: TIn) => string)) {
    return new OperationStep(this.scale, this.addProgress, p => (
      {
        ...p as Progress,
        processTitle: title instanceof String
          ? title
          : title(p),
      }
    ))
  }

  public withDescription(description: string | ((progress: TIn) => string)) {
    return new OperationStep(this.scale, this.addProgress, p => (
      {
        ...p as Progress,
        processDescription: description instanceof String
          ? description
          : description(p),
      }
    ))
  }
}

