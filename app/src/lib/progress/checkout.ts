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

  /**
   * The last send progress event, or null if the parser has been stopped
   * and no more events are to be sent.
   */
  private currentProgress: ICheckoutProgress | null

  public constructor(repository: Repository, targetBranch: string, onCheckoutProgress: CheckoutProgressEventHandler) {
    this.repository = repository
    this.targetBranch = targetBranch
    this.onCheckoutProgress = onCheckoutProgress

    this.currentProgress = {
      progressText: `Checking out branch ${targetBranch}`,
      progressValue: 0,
      targetBranch,
    }

    this.onCheckoutProgress(repository, this.currentProgress)
  }

  private notify(progressText: string, progressValue?: number) {

    const currentProgress = this.currentProgress

    if (!currentProgress) {
      return
    }

    const newProgress = {
      targetBranch: this.targetBranch,
      progressText,
      progressValue: progressValue === undefined
        ? currentProgress.progressValue
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
    if (!this.currentProgress) {
      return
    }

    this.onCheckoutProgress(this.repository, null)
    this.currentProgress = null
  }
}
