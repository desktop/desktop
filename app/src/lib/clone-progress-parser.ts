/* Highly approximate (some would say outright innacurate) division
 * of the individual progress reporting steps in a clone operation
 */
const costsByStep = [
  { expr: /remote: Compressing objects:\s+(\d+)%/, cost: 0.1 },
  { expr: /Receiving objects:\s+(\d+)%/, cost: 0.7 },
  { expr: /Resolving deltas:\s+(\d+)%/, cost: 0.1 },
  { expr: /Checking out files:\s+(\d+)%/, cost: 0.09 },
]

export class CloneProgressParser {
  /* The steps listed in costsByStep always occur in order but some
   * might not happen at all (like remote compression of objects) so
   * we keep track of the "highest" seen step so that we can fill in
   * progress with the assumption that we've already seen the previous
   * steps. Null means that we haven't seen anything matching our
   * regular expressions yet.
   */
  private highestSeenStep: number | null = null

  public parse(line: string): number | null {
    /* The accumulated progress, 0 to 1. Null means indeterminate */
    let progressValue = this.highestSeenStep == null ? null : 0

    /* Add add up the progress from steps we've already "seen" */
    if (this.highestSeenStep != null) {
      for (let i = 0; i < this.highestSeenStep; i++) {
        progressValue += costsByStep[i].cost
      }
    }

    /* Iterate over the steps we haven't seen yet and try to find
     * one that matches
     */
    for (let i = this.highestSeenStep || 0; i < costsByStep.length; i++) {
      const step = costsByStep[i]
      const match = step.expr.exec(line)

      if (match != null) {
        this.highestSeenStep = i
        progressValue += (parseInt(match[1], 10) / 100) * step.cost
        break
      }
    }

    return progressValue
  }
}
