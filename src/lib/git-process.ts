import * as path from 'path'
import * as cp from 'child_process'

const gitNotFoundErrorCode: number = 128

export enum GitErrorCode {
  NotFound
}

/**
 * Encapsulate the error from Git for callers to handle
 */
export class GitError extends Error {
  /**
   * The error code returned from the Git process
   */
  public readonly errorCode: GitErrorCode

  /**
   * The error text returned from the Git process
   */
  public readonly errorOutput: string

  public constructor(errorCode: number, errorOutput: string) {
    super()

    this.errorCode = errorCode
    this.errorOutput = errorOutput
  }
}

export class GitProcess {
  /**
   *  Find the path to the embedded Git environment
   */
  private static resolveGit(): string {
    if (process.platform === 'darwin') {
      return path.join(__dirname, 'git/bin/git')
    } else if (process.platform === 'win32') {
      return path.join(__dirname, 'git/cmd/git.exe')
    } else {
      throw new Error('Git not supported on platform: ' + process.platform)
    }
  }

  /**
   *  Execute a command using the embedded Git environment
   */
  public static exec(args: string[], path: string): Promise<void> {
    return new Promise(function(resolve, reject) {
      const gitLocation = GitProcess.resolveGit()
      const formatArgs = 'executing: git ' + args.join(' ')

      cp.execFile(gitLocation, args, { cwd: path, encoding: 'utf8' }, function(err, output, stdErr) {
        if (err) {
          console.error(formatArgs)
          console.error(err)
          reject(err)
          return
        }

        console.log(formatArgs)
        resolve()
      })
    })
  }

  /**
   *  Execute a command and read the output using the embedded Git environment
   */
  public static execWithOutput(args: string[], path: string): Promise<string> {
    return new Promise<string>(function(resolve, reject) {
      const gitLocation = GitProcess.resolveGit()
      const formatArgs = 'executing: git ' + args.join(' ')

      cp.execFile(gitLocation, args, { cwd: path, encoding: 'utf8' }, function(err, output, stdErr) {
        if (!err) {
          console.log(formatArgs)
          resolve(output)
          return
        }

        if ((err as any).code) {
          // TODO: handle more error codes
          const code: number = (err as any).code
          if (code === gitNotFoundErrorCode) {
            reject(new GitError(GitErrorCode.NotFound, stdErr))
            return
          }
        }

        console.error(formatArgs)
        console.error(err)
        reject()
      })
    })
  }
}
