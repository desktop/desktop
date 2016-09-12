/* Highly approximate (some would say outright innacurate) division
 * of the individual progress reporting steps in a clone operation
 */
const costsByStep = [
  { expr: /remote: Compressing objects:\s+(\d+)%/, cost: 0.1 },
  { expr: /Receiving objects:\s+(\d+)%/, cost: 0.7 },
  { expr: /Resolving deltas:\s+(\d+)%/, cost: 0.1 },
  { expr: /Checking out files:\s+(\d+)%/, cost: 0.09 },
]

/**
 * A utility class for interpreting the output from `git clone --progress`
 * and turning that into a percentage value estimating the overall progress
 * of the clone.
 */
export class CloneProgressParser {
  /* The steps listed in costsByStep always occur in order but some
   * might not happen at all (like remote compression of objects) so
   * we keep track of the "highest" seen step so that we can fill in
   * progress with the assumption that we've already seen the previous
   * steps. Null means that we haven't seen anything matching our
   * regular expressions yet.
   */
  private highestSeenStep: number | null = null

  /* The last progress value we returned from parse. Null means
   * we haven't parsed a line we understand yet, ie indeterminate */
  private lastProgress: number | null = null

  /**
   * Parses a single line of output from 'git clone --progress'.
   * Returns a fractional value between 0 and 1 indicating the
   * overall progress so far or null if progress is still
   * indeterminate.
   */
  public parse(line: string): number | null {
    /* Iterate over the steps we haven't seen yet and try to find
     * one that matches. */
    for (let i = this.highestSeenStep || 0; i < costsByStep.length; i++) {
      const step = costsByStep[i]
      const match = step.expr.exec(line)

      if (match != null) {
        this.highestSeenStep = i
        let progressValue = (parseInt(match[1], 10) / 100) * step.cost

        /* Sum up the full progress of previous steps whether we've
         * actually seen them or not */
        for (let i = 0; i < this.highestSeenStep; i++) {
          progressValue += costsByStep[i].cost
        }

        this.lastProgress = progressValue
        return progressValue
      }
    }

    /* No match, return whatever we've got stored */
    return this.lastProgress
  }
}
