import { pathExists } from '../../ui/lib/path-exists'
import { join } from 'path'
import which from 'which'
import { bash, cmd, powershell } from './shell-escape'
import { SupportedHooksEnvShell } from './config'
import { assertNever } from '../fatal-error'
import { enumerateValues, HKEY, RegistryValueType } from 'registry-js'

type Shell = {
  shell: string
  args: string[]
  quoteCommand: (cmd: string, ...args: string[]) => string
  windowsVerbatimArguments?: boolean
  argv0?: string
}

export const findGitBash = async () => {
  const gitPath = await which('git', { nothrow: true })
  let bashPath: string | null = null

  if (gitPath?.toLowerCase().endsWith('\\cmd\\git.exe')) {
    bashPath = join(gitPath, '../../usr/bin/bash.exe')
  } else if (gitPath?.toLowerCase().endsWith('\\mingw64\\bin\\git.exe')) {
    bashPath = join(gitPath, '../../../usr/bin/bash.exe')
  } else {
    const HKLM = HKEY.HKEY_LOCAL_MACHINE
    const values = enumerateValues(HKLM, 'SOFTWARE\\GitForWindows')
    const installPath = values.find(v => v.name === 'InstallPath')

    if (installPath?.type === RegistryValueType.REG_SZ) {
      bashPath = join(installPath.data, 'usr/bin/bash.exe')
    }
  }

  if (!bashPath) {
    return null
  }

  return (await pathExists(bashPath)) ? bashPath : null
}

// https://github.com/git-for-windows/git/blob/bd2ecbae58213046a468256b95fc4864de25bdf5/compat/mingw.c#L1690-L1718
const quoteArgMsys2 = (arg: string) => {
  return /[\s\\"'{?*~]/.test(arg) ? `"${arg.replace(/(["\\])/g, '\\$1')}"` : arg
}

const findGitBashShell = async (): Promise<Shell | undefined> => {
  const gitBashPath = await findGitBash()

  if (!gitBashPath) {
    return undefined
  }
  const { args, quoteCommand } = bash
  return {
    shell: gitBashPath,
    args,
    quoteCommand: (cmd, ...args) => quoteArgMsys2(quoteCommand(cmd, ...args)),
    // MSYS2 doesn't use the argv it's given, instead it re-parses the
    // commandline from GetCommandLineW and it doesn't comform to the
    // usual Windows quoting rules. So we need to opt out of Node.js's
    // quoting behavior and do it ourselves.
    //
    // See https://github.com/git-for-windows/git/commit/9e9da23c27650
    windowsVerbatimArguments: true,
    // With windowsVerbatimArguments set to true the filename passed to
    // spawn won't get quoted by Node.js so he msys2 custom argument parser
    // will blow up so we'll just hardcode argv[0] as bash.exe which is
    // what it would be set to if a user ran bash.exe in a terminal and it
    // was on PATH. The technically correct way would be to set quote it
    // as msys2 expects it to be quoted but I'm too deep into Dantes nine
    // circles of quoting already.
    argv0: 'bash.exe',
  }
}

const findCmdShell = async (): Promise<Shell> => {
  const { COMSPEC } = process.env
  // https://github.com/nodejs/node/blob/5f77aebdfb3ea4d60cda79045d29afb244d6bcb1/lib/child_process.js#L660C31-L660C58
  const shell =
    COMSPEC && /^(?:.*\\)?cmd(?:\.exe)?$/i.test(COMSPEC) ? COMSPEC : 'cmd.exe'
  const { args, quoteCommand } = cmd
  return { shell, args, quoteCommand, windowsVerbatimArguments: true }
}

const findPowerShellShell = async (
  shellKind: Extract<SupportedHooksEnvShell, 'powershell' | 'pwsh'>
): Promise<Shell | undefined> => {
  const pwshPath = await which(`${shellKind}.exe`, { nothrow: true })
  if (!pwshPath) {
    return undefined
  }
  const { args, quoteCommand } = powershell
  return { shell: pwshPath, args, quoteCommand }
}

const findWindowsShell = async (
  shellKind: SupportedHooksEnvShell = 'cmd'
): Promise<Shell | undefined> => {
  switch (shellKind) {
    case 'git-bash':
      return findGitBashShell()
    case 'powershell':
    case 'pwsh':
      return findPowerShellShell(shellKind)
    case 'cmd':
      return findCmdShell()
    default:
      return assertNever(shellKind, `Unsupported shell kind: ${shellKind}`)
  }
}

export const getShell = async (
  shellKind?: SupportedHooksEnvShell
): Promise<Shell | undefined> => {
  if (__WIN32__) {
    return findWindowsShell(shellKind)
  }

  // For our purposes quoting using bash rules should be sufficient,
  // we only need to pass a path to an executable that we control.
  // Should we start using this to quote commands that Git gives us
  // those are quite innocuous as well (like shas and paths). There
  // shouldn't be any user input in there.
  const { args, quoteCommand } = bash
  return { shell: process.env.SHELL ?? '/bin/sh', args, quoteCommand }
}
