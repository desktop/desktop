import * as Path from 'path'

export function getDesktopAskpassTrampolinePath(): string {
  return Path.join(
    __dirname,
    'build',
    'Release',
    getDesktopAskpassTrampolineFilename()
  )
}

export function getDesktopAskpassTrampolineFilename(): string {
  return process.platform === 'win32'
    ? 'desktop-askpass-trampoline.exe'
    : 'desktop-askpass-trampoline'
}

export function getDesktopCredentialHelperTrampolinePath(): string {
  return Path.join(
    __dirname,
    'build',
    'Release',
    getDesktopCredentialHelperTrampolineFilename()
  )
}

export function getDesktopCredentialHelperTrampolineFilename(): string {
  return process.platform === 'win32'
    ? 'desktop-credential-helper-trampoline.exe'
    : 'desktop-credential-helper-trampoline'
}

export function getSSHWrapperPath(): string {
  return Path.join(__dirname, 'build', 'Release', getSSHWrapperFilename())
}

export function getSSHWrapperFilename(): string {
  return process.platform === 'win32' ? 'ssh-wrapper.exe' : 'ssh-wrapper'
}
