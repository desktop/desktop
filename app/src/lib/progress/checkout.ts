import { Repository } from '../../models/repository'

/** 
 * An object describing the progression of a branch checkout operation
 */
export interface ICheckoutProgress {
  /** The branch that's currently being checked out */
  readonly targetBranch: string

  /** 
   * The overall progress of the operation, represented as a fraction between
   * 0 and 1.
   */
  readonly progressValue: number

  /**
   * 
   * An informative text for user consumption indicating the current operation
   * state.
   */
  readonly progressText: string
}

const checkoutProgressRe = /Checking out files:\s+(\d+)\s*% \((\d+)\/(\d+)\)/

export type CheckoutProgressEventHandler = (repository: Repository, progress: ICheckoutProgress | null) => void

export class CheckoutProgressParser {
  private readonly onCheckoutProgress: CheckoutProgressEventHandler
  private readonly repository: Repository
  private readonly targetBranch: string
  private stopped: boolean = false
  private currentProgress: ICheckoutProgress | null = null

  public constructor(repository: Repository, targetBranch: string, onCheckoutProgress: CheckoutProgressEventHandler) {
    this.repository = repository
    this.targetBranch = targetBranch
    this.onCheckoutProgress = onCheckoutProgress
  }

  private notify(progressText: string, progressValue?: number) {

    if (this.stopped) {
      return
    }

    const currentProgressValue = this.currentProgress
      ? this.currentProgress.progressValue
      : 0

    const newProgress = {
      targetBranch: this.targetBranch,
      progressText,
      progressValue: progressValue === undefined
        ? currentProgressValue
        : progressValue,
    }

    this.onCheckoutProgress(this.repository, newProgress)
    this.currentProgress = newProgress
  }

  public parse = (checkoutOutput: string) => {
    const match = checkoutProgressRe.exec(checkoutOutput)

    if (!match || match.length !== 4) {
      return
    }

    const filesCompleted = parseInt(match[2], 10)
    const filesTotal = parseInt(match[3], 10)

    if (isNaN(filesCompleted) || isNaN(filesTotal) || filesTotal === 0) {
      return
    }

    this.notify(match[0], filesCompleted / filesTotal)
  }

  public end = () => {
    if (this.stopped) {
      return
    }

    this.stopped = true

    this.onCheckoutProgress(this.repository, null)
    this.currentProgress = null
  }
}
