import { GitProgressParser, IProgressStep } from './git'

const steps: ReadonlyArray<IProgressStep> = []

/**
 * A class that parses output from `git revert` and provides structured progress
 * events.
 */
export class RevertProgressParser extends GitProgressParser {
  public constructor() {
    super(steps)
  }
}
