import { enableHooksByDefault, enableHooksEnvironment } from '../feature-flag'
import { getBoolean, setBoolean } from '../local-storage'

export const defaultHooksEnvEnabledValue = enableHooksByDefault()

/**
 * Whether the hooks environment is enabled, takes into account the
 * `enableHooksEnvironment` feature flag.
 */
export const getHooksEnvEnabled = () =>
  enableHooksEnvironment() &&
  getBoolean('git-hooks-env-enabled', defaultHooksEnvEnabledValue)

export const setHooksEnvEnabled = (enabled: boolean): void =>
  setBoolean('git-hooks-env-enabled', enabled)

export const defaultCacheHooksEnvValue = true
export const getCacheHooksEnv = () =>
  getBoolean('git-cache-hooks-env', defaultCacheHooksEnvValue)
export const setCacheHooksEnv = (enabled: boolean): void =>
  setBoolean('git-cache-hooks-env', enabled)

export const defaultGitHookEnvShell: SupportedHooksEnvShell = 'git-bash'
export const getGitHookEnvShell = (): SupportedHooksEnvShell => {
  const shell = localStorage.getItem('git-hook-env-shell')
  if (
    shell === 'git-bash' ||
    shell === 'pwsh' ||
    shell === 'powershell' ||
    shell === 'cmd'
  ) {
    return shell
  }
  return defaultGitHookEnvShell
}

export const shellFriendlyNames: Readonly<
  Record<SupportedHooksEnvShell, string>
> = {
  'git-bash': 'Git Bash',
  pwsh: 'PowerShell Core',
  powershell: 'Windows PowerShell',
  cmd: 'Command Prompt',
}

export const setGitHookEnvShell = (shell: string) =>
  localStorage.setItem('git-hook-env-shell', shell)

export type SupportedHooksEnvShell = 'git-bash' | 'pwsh' | 'powershell' | 'cmd'
