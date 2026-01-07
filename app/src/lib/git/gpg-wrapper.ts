import { spawn, ChildProcess } from 'child_process'

/**
 * A wrapper for GPG that intercepts passphrase prompts and uses our stored passphrases
 * instead of launching pinentry.
 */
export async function createGPGWrapperScript(): Promise<string> {
  // For now, return the path to the regular GPG program
  // This is a placeholder for a more sophisticated wrapper if needed
  return 'C:\\Program Files\\Git\\usr\\bin\\gpg.exe'
}

/**
 * Wrapper function that can be used to run GPG commands with our passphrase handling
 */
export async function runGPGWithPassphrase(
  args: string[],
  options: { cwd?: string; stdin?: string } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const gpgPath = 'C:\\Program Files\\Git\\usr\\bin\\gpg.exe'

    // Add --pinentry-mode loopback to force GPG to use our passphrase mechanism
    const gpgArgs = ['--pinentry-mode', 'loopback', ...args]

    const gpgProcess: ChildProcess = spawn(gpgPath, gpgArgs, {
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    if (gpgProcess.stdout) {
      gpgProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
    }

    if (gpgProcess.stderr) {
      gpgProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })
    }

    gpgProcess.on('close', (code: number | null) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      })
    })

    gpgProcess.on('error', (error: Error) => {
      reject(error)
    })

    if (options.stdin && gpgProcess.stdin) {
      gpgProcess.stdin.write(options.stdin)
      gpgProcess.stdin.end()
    }
  })
}
