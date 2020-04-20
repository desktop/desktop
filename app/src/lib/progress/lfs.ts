import { IGitOutput } from './git'


/** The progress parser for Git LFS. */
export class GitLFSProgressParser {

  private lastResult: IGitOutput = {
    kind: 'context',
    text: 'Downloading Git LFS file…',
    percent: 0,
  }

  public parse(line: string): IGitOutput {
    line = line.trim()
    if (line !== '') {
      this.lastResult = {
        kind: "context",
        text: line,
        percent: 0
      }
    }
    return this.lastResult
  }

}
