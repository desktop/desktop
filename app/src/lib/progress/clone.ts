import { GitProgressParser } from './git'

/**
 * Highly approximate (some would say outright inaccurate) division
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
export class CloneProgressParser extends GitProgressParser {
  public constructor() {
    super(steps)
  }
}
