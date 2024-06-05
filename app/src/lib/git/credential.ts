import { GitProcess } from 'dugite'

export const parseCredential = (value: string) =>
  new Map([...value.matchAll(/^(.*?)=(.*)$/gm)].map(([, k, v]) => [k, v]))

export const formatCredential = (credential: Map<string, string>) =>
  [...credential].map(([k, v]) => `${k}=${v}\n`).join('')

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
