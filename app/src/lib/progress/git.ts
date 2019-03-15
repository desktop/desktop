/**
 * Identifies a particular subset of progress events from Git by
 * title.
 */
export interface IProgressStep {
  /**
   * The title of the git progress event. By title we refer to the
   * exact value of the title field in the Git progress struct:
   *
   * https://github.com/git/git/blob/6a2c2f8d34fa1e8f3bb85d159d354810ed63692e/progress.c#L31-L39
   *
   * In essence this means anything up to (but not including) the last colon (:)
   * in a single progress line. Take this example progress line
   *
   *    remote: Compressing objects:  14% (159/1133)
   *
   * In this case the title would be 'remote: Compressing objects'.
   */
  readonly title: string

  /**
   * The weight of this step in relation to others for a particular
   * Git operation. This value can be any number as long as it's
   * proportional to others in the same parser, it will all be scaled
   * to a decimal value between 0 and 1 before being used to calculate
   * overall progress.
   */
  readonly weight: number
}

/**
 * The overall progress of one or more steps in a Git operation.
 */
export interface IGitProgress {
  readonly kind: 'progress'

  /**
   * The overall percent of the operation
   */
  readonly percent: number

  /**
   * The underlying progress line that this progress instance was
   * constructed from. Note that the percent value in details
   * doesn't correspond to that of percent in this instance for
   * two reasons. Fist, we calculate percent by dividing value with total
   * to produce a high precision decimal value between 0 and 1 while
   * details.percent is a rounded integer between 0 and 100.
   *
   * Second, the percent in this instance is scaled in relation to any
   * other steps included in the progress parser.
   */
  readonly details: IGitProgressInfo
}

export interface IGitOutput {
  readonly kind: 'context'
  readonly percent: number
  readonly text: string
}

/**
 * A well-structured representation of a Git progress line.
 */
export interface IGitProgressInfo {
  /**
   * The title of the git progress event. By title we refer to the
   * exact value of the title field in Git's progress struct:
   *
   * https://github.com/git/git/blob/6a2c2f8d34fa1e8f3bb85d159d354810ed63692e/progress.c#L31-L39
   *
   * In essence this means anything up to (but not including) the last colon (:)
   * in a single progress line. Take this example progress line
   *
   *    remote: Compressing objects:  14% (159/1133)
   *
   * In this case the title would be 'remote: Compressing objects'.
   */
  readonly title: string

  /**
   * The progress value as parsed from the Git progress line.
   *
   * We define value to mean the same as it does in the Git progress struct, i.e
   * it's the number of processed units.
   *
   * In the progress line 'remote: Compressing objects:  14% (159/1133)' the
   * value is 159.
   *
   * In the progress line 'remote: Counting objects: 123' the value is 123.
   *
   */
  readonly value: number

  /**
   * The progress total as parsed from the git progress line.
   *
   * We define total to mean the same as it does in the Git progress struct, i.e
   * it's the total number of units in a given process.
   *
   * In the progress line 'remote: Compressing objects:  14% (159/1133)' the
   * total is 1133.
   *
   * In the progress line 'remote: Counting objects: 123' the total is undefined.
   *
   */
  readonly total?: number

  /**
   * The progress percent as parsed from the git progress line represented as
   * an integer between 0 and 100.
   *
   * We define percent to mean the same as it does in the Git progress struct, i.e
   * it's the value divided by total.
   *
   * In the progress line 'remote: Compressing objects:  14% (159/1133)' the
   * percent is 14.
   *
   * In the progress line 'remote: Counting objects: 123' the percent is undefined.
   *
   */
  readonly percent?: number

  /**
   * Whether or not the parsed git progress line indicates that the operation
   * is done.
   *
   * This is denoted by a trailing ", done" string in the progress line.
   * Example: Checking out files:  100% (728/728), done
   */
  readonly done: boolean

  /**
   * The untouched raw text line that this instance was parsed from. Useful
   * for presenting the actual output from Git to the user.
   */
  readonly text: string
}

/**
 * Base interface for parsing progess reported from Git
 */
export interface IGitProgressParser {
  /**
   * Parse the given line of output from Git, returns either an IGitProgress
   * instance if the line could successfully be parsed as a Git progress
   * event or a IGitOutput instance if the line couldn't be parsed.
   */
  parse: (line: string) => IGitProgress | IGitOutput
}

/**
 * A utility class for interpreting progress output from `git`
 * and turning that into a percentage value estimating the overall progress
 * of the an operation. An operation could be something like `git fetch`
 * which contains multiple steps, each individually reported by Git as
 * progress events between 0 and 100%.
 *
 * A parser cannot be reused, it's mean to parse a single stderr stream
 * for Git.
 */
export class GitProgressParser implements IGitProgressParser {
  private readonly steps: ReadonlyArray<IProgressStep>

  /* The provided steps should always occur in order but some
   * might not happen at all (like remote compression of objects) so
   * we keep track of the "highest" seen step so that we can fill in
   * progress with the assumption that we've already seen the previous
   * steps.
   */
  private stepIndex = 0

  private lastPercent = 0

  /**
   * Initialize a new instance of a Git progress parser.
   *
   * @param steps - A series of steps that could be present in the git
   *                output with relative weight between these steps. Note
   *                that order is significant here as once the parser sees
   *                a progress line that matches a step all previous steps
   *                are considered completed and overall progress is adjusted
   *                accordingly.
   */
  public constructor(steps: ReadonlyArray<IProgressStep>) {
    if (!steps.length) {
      throw new Error('must specify at least one step')
    }

    // Scale the step weight so that they're all a percentage
    // adjusted to the total weight of all steps.
    const totalStepWeight = steps.reduce((sum, step) => sum + step.weight, 0)

    this.steps = steps.map(step => ({
      title: step.title,
      weight: step.weight / totalStepWeight,
    }))
  }

  public parse(line: string): IGitProgress | IGitOutput {
    const progress = parse(line)

    if (!progress) {
      return { kind: 'context', text: line, percent: this.lastPercent }
    }

    let percent = 0

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i]

      if (i >= this.stepIndex && progress.title === step.title) {
        if (progress.total) {
          percent += step.weight * (progress.value / progress.total)
        }

        this.stepIndex = i
        this.lastPercent = percent

        return { kind: 'progress', percent, details: progress }
      } else {
        percent += step.weight
      }
    }

    return { kind: 'context', text: line, percent: this.lastPercent }
  }
}

const percentRe = /^(\d{1,3})% \((\d+)\/(\d+)\)$/
const valueOnlyRe = /^\d+$/

/**
 * Attempts to parse a single line of progress output from Git.
 *
 * For details about how Git formats progress see
 *
 *   https://github.com/git/git/blob/6a2c2f8d34fa1e8f3bb85d159d354810ed63692e/progress.c
 *
 * Some examples:
 *  remote: Counting objects: 123
 *  remote: Counting objects: 167587, done.
 *  Receiving objects:  99% (166741/167587), 272.10 MiB | 2.39 MiB/s
 *  Checking out files:  100% (728/728)
 *  Checking out files:  100% (728/728), done
 *
 * @returns An object containing well-structured information about the progress
 *          or null if the line could not be parsed as a Git progress line.
 */
export function parse(line: string): IGitProgressInfo | null {
  const titleLength = line.lastIndexOf(': ')

  if (titleLength === 0) {
    return null
  }

  if (titleLength - 2 >= line.length) {
    return null
  }

  const title = line.substr(0, titleLength)
  const progressText = line.substr(title.length + 2).trim()

  if (!progressText.length) {
    return null
  }

  const progressParts = progressText.split(', ')

  if (!progressParts.length) {
    return null
  }

  let value: number
  let total: number | undefined = undefined
  let percent: number | undefined = undefined

  if (valueOnlyRe.test(progressParts[0])) {
    value = parseInt(progressParts[0], 10)

    if (isNaN(value)) {
      return null
    }
  } else {
    const percentMatch = percentRe.exec(progressParts[0])

    if (!percentMatch || percentMatch.length !== 4) {
      return null
    }

    percent = parseInt(percentMatch[1], 10)
    value = parseInt(percentMatch[2], 10)
    total = parseInt(percentMatch[3], 10)

    if (isNaN(percent) || isNaN(value) || isNaN(total)) {
      return null
    }
  }

  let done = false

  // We don't parse throughput at the moment so let's just loop
  // through the remaining
  for (let i = 1; i < progressParts.length; i++) {
    if (progressParts[i] === 'done.') {
      done = true
      break
    }
  }

  return { title, value, percent, total, done, text: line }
}
