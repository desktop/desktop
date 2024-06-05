import { GitProcess } from 'dugite'

export const parseCredential = (value: string) => {
  const cred = new Map<string, string>()

  for (const [, k, v] of value.matchAll(/^(.*?)=(.*)$/gm)) {
    if (k.endsWith('[]')) {
      let i = 0
      const base = k.slice(0, -2)
      while (cred.has(`${base}[${i}]`)) {
        i++
      }
      cred.set(`${base}[${i}]`, v)
    } else {
      cred.set(k, v)
    }
  }

  return cred
}

export const formatCredential = (credential: Map<string, string>) =>
  [...credential]
    .map(([k, v]) => `${k.replace(/\[\d+\]$/, '[]')}=${v}\n`)
    .join('')

// Can't use git() as that will call withTrampolineEnv which calls this method
const exec = (
  cmd: string,
  cred: Map<string, string>,
  path: string,
  env: Record<string, string | undefined> = {}
) =>
  GitProcess.exec(
    [
      ...['-c', 'credential.helper='],
      ...['-c', `credential.helper=manager`],
      'credential',
      cmd,
    ],
    path,
    {
      stdin: formatCredential(cred),
      env: {
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
        TERM: 'dumb',
        ...env,
      },
    }
  ).then(({ exitCode, stderr, stdout }) => {
    if (exitCode !== 0) {
      throw new Error(stderr)
    }
    return parseCredential(stdout)
  })

export const fillCredential = exec.bind(null, 'fill')
export const approveCredential = exec.bind(null, 'approve')
export const rejectCredential = exec.bind(null, 'reject')
