import { StepProgressParser } from './step-progress'

/**
 * Highly approximate (some would say outright inaccurate) division
 * of the individual progress reporting steps in a push operation
 */
const steps = [
  { title: 'Compressing objects', weight: 0.2 },
  { title: 'Writing objects', weight: 0.7 },
  { title: 'remote: Resolving deltas', weight: 0.1 },
]

/**
 * A utility class for interpreting the output from `git push --progress`
 * and turning that into a percentage value estimating the overall progress
 * of the clone.
 */
export class PushProgressParser {

  private readonly parser: StepProgressParser

  public constructor() {
    this.parser = new StepProgressParser(steps)
  }

  /**
   * Parses a single line of output from 'git push --progress'.
   * Returns a fractional value between 0 and 1 indicating the
   * overall progress so far or null if progress is still
   * indeterminate.
   */
  public parse(line: string): number | null {
    const progress = this.parser.parse(line)
    return progress ? progress.percent : null
  }
}
