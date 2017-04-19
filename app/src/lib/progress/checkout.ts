import { Repository } from '../../models/repository'
import { parse } from './parser'

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

export type CheckoutProgressEventHandler = (repository: Repository, progress: ICheckoutProgress | null) => void

/**
 * A class that parses output from `git checkout --progress` and provides
 * structured progress events.
 */
export class CheckoutProgressParser {
  private readonly onCheckoutProgress: CheckoutProgressEventHandler
  private readonly repository: Repository
  private readonly targetBranch: string

  /**
   * The last send progress event, or null if the parser has been stopped
   * and no more events are to be sent.
   */
  private currentProgress: ICheckoutProgress | null

  /**
   * Initialize a new progress parser. A parser should not be reused between
   * different git checkout invocations and should always be terminated when
   * the Git command terminates by calling the end() instance method.
   */
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
    const progress = parse(checkoutOutput)

    if (progress && progress.title === 'Checking out files' && progress.total) {
      this.notify(checkoutOutput, progress.value / progress.total)
    }
  }

  public end = () => {
    if (!this.currentProgress) {
      return
    }

    this.onCheckoutProgress(this.repository, null)
    this.currentProgress = null
  }
}
