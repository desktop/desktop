import { StepProgressParser } from './step-progress'

/* Highly approximate (some would say outright inaccurate) division
 * of the individual progress reporting steps in a clone operation
 */
const steps = [
  { title: 'remote: Compressing objects', weight: 0.1 },
  { title: 'Receiving objects', weight: 0.6 },
  { title: 'Resolving deltas', weight: 0.1 },
  { title: 'Checking out files', weight: 0.2 },
]

/**
 * A utility class for interpreting the output from `git clone --progress`
 * and turning that into a percentage value estimating the overall progress
 * of the clone.
 */
export class CloneProgressParser {

  private readonly parser: StepProgressParser

  public constructor() {
    this.parser = new StepProgressParser(steps)
  }

  /**
   * Parses a single line of output from 'git clone --progress'.
   * Returns a fractional value between 0 and 1 indicating the
   * overall progress so far or null if progress is still
   * indeterminate.
   */
  public parse(line: string): number | null {
    const progress = this.parser.parse(line)
    return progress ? progress.percent : null
  }
}
