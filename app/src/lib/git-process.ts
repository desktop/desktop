import * as path from 'path'
import * as cp from 'child_process'

const gitNotFoundErrorCode: number = 128
const gitChangesExistErrorCode: number = 1

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
  private static resolveGitDir(): string {
    let base = __dirname
    if (process.env.TEST_ENV) {
      if (process.platform === 'darwin') {
        base = path.join(__dirname, '..', '..', '..', 'git', 'git-macos')
      } else if (process.platform === 'win32') {
        base = path.join(__dirname, '..', '..', '..', 'git', 'git-win32')
      }
    }

    return path.join(base, 'git')
  }

  /**
   *  Find the path to the embedded Git binary
   */
  private static resolveGitBinary(): string {
    const gitDir = GitProcess.resolveGitDir()
    if (process.platform === 'darwin') {
      return path.join(gitDir, 'bin', 'git')
    } else if (process.platform === 'win32') {
      return path.join(gitDir, 'cmd', 'git.exe')
    }

    throw new Error('Git not supported on platform: ' + process.platform)
  }

  /** Find the path to the embedded git exec path. */
  private static resolveGitExecPath(): string {
    const gitDir = GitProcess.resolveGitDir()
    if (process.platform === 'darwin') {
      return path.join(gitDir, 'libexec', 'git-core')
    } else if (process.platform === 'win32') {
      return path.join(gitDir, 'mingw64', 'libexec', 'git-core')
    }

    throw new Error('Git not supported on platform: ' + process.platform)
  }

  /**
   *  Execute a command using the embedded Git environment
   */
  public static exec(args: string[], path: string): Promise<void> {
    return this.execWithOutput(args, path)
  }

  /**
   *  Execute a command and read the output using the embedded Git environment
   */
  public static execWithOutput(args: string[], path: string): Promise<string> {
    return new Promise<string>(function(resolve, reject) {
      const gitLocation = GitProcess.resolveGitBinary()
      const startTime = performance.now()
      const logMessage = () => {
        const time = ((performance.now() - startTime) / 1000).toFixed(3)
        return `executing: git ${args.join(' ')} (took ${time}s)`
      }
      const env = Object.assign({}, process.env, {
        GIT_EXEC_PATH: GitProcess.resolveGitExecPath(),
      })

      cp.execFile(gitLocation, args, { cwd: path, encoding: 'utf8', env }, function(err, output, stdErr) {
        if (!err) {
          console.debug(logMessage())
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

          if (code === gitChangesExistErrorCode && output !== '') {
            // `git diff` seems to emulate the exit codes from `diff`
            // irrespective of whether you set --exit-code
            //
            // this is the behaviour:
            // - 0 if no changes found
            // - 1 if changes found
            // -   and error otherwise
            //
            // citation in source:
            // https://github.com/git/git/blob/1f66975deb8402131fbf7c14330d0c7cdebaeaa2/diff-no-index.c#L300
            console.debug(logMessage())
            resolve(output)
          }
        }

        console.error(logMessage())
        console.error(err)
        reject(err)
      })
    })
  }
}
