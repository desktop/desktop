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
