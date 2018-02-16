import { ChildProcess } from 'child_process'

export function reportProcessOutputError(
  childProcess: ChildProcess,
  context: string
) {
  childProcess.stdout.on('error', err => {
    const errWithCode = err as ErrorWithCode
    const code = errWithCode.code

    if (typeof code === 'string') {
      if (code === 'EPIPE') {
        log.error(`[${context}] stdout was terminated with an EPIPE`, err)
        return
      }
      if (code === 'EOF') {
        log.error(`[${context}] stdout was terminated with an EOF`, err)
        return
      }
    }

    log.error(`[${context}] stdout reported an error`, err)
  })
}
