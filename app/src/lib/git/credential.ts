import { GitProcess } from 'dugite'

function parseCredential(output: string) {
  const kv = new Map<string, string>()
  for (const [, k, v] of output.matchAll(/^(.*?)=(.*)$/gm)) {
    kv.set(k, v)
  }
  return kv
}

function formatCredential(credential: Map<string, string>) {
  return [...credential].map(([k, v]) => `${k}=${v}\n`).join('')
}

const execCredential = (args: string[], helper: string, stdin?: string) =>
  // Can't use git() as that will call withTrampolineEnv which calls this method
  GitProcess.exec(
    [
      ...['-c', 'credential.helper='],
      ...['-c', `credential.helper=${helper}`],
      'credential',
      ...args,
    ],
    process.cwd(),
    {
      stdin,
      env: {
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
        TERM: 'dumb',
      },
    }
  ).then(r => {
    if (r.exitCode !== 0) {
      // TODO: can we handle this error like we handle other errors in git()?
      throw new Error(r.stderr)
    }
    return parseCredential(r.stdout)
  })

export const fillCredential = (endpoint: string, helper: string) =>
  execCredential(['fill'], helper, `url=${endpoint}\n`)

export const approveCredential = (
  credential: Map<string, string>,
  helper: string
) => execCredential(['approve'], helper, formatCredential(credential))

export const rejectCredential = (
  credential: Map<string, string>,
  helper: string
) => execCredential(['reject'], helper, formatCredential(credential))
