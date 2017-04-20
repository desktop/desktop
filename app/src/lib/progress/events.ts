export type Progress = IGenericProgress
  | ICheckoutProgress
  | IPushProgress
  | IFetchProgress
  | IPullProgress

/**
 * Base interface containing all the properties that progress events
 * needs to support.
 */
interface IProgress {

  /** 
   * The overall progress of the operation, represented as a fraction between
   * 0 and 1.
   */
  readonly progressValue: number

  /**
   * An informative text for user consumption indicating the current operation
   * state. This will be high level such as 'Pushing origin' or 
   * 'Fetching upstream' and will typically persist over a number of progress
   * events. For more detailed information about the progress see
   * progressDescription
   */
  readonly progressTitle: string

  /**
   * An informative text for user consumption. In the case of git progress this
   * will usually be the last raw line of output from git.
   */
  readonly progressDescription: string
}

export interface IGenericProgress extends IProgress {
  readonly kind: 'generic',
}

export interface ICheckoutProgress extends IProgress {
  readonly kind: 'checkout',

  /** The branch that's currently being checked out */
  readonly targetBranch: string
}

export interface IPushProgress extends IProgress {
  readonly kind: 'push',

  /** The remote that's being pushed */
  readonly remote: string
}

export interface IPullProgress extends IProgress {
  readonly kind: 'pull',

  /** The remote that's being pulled from */
  readonly remote: string
}

export interface IFetchProgress extends IProgress {
  readonly kind: 'fetch',

  /** The remote that's being fetched */
  readonly remote: string
}
