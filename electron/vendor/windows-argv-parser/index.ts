const nativeModule =
  process.platform === 'win32'
    ? require('./Release/windows-argv-parser.node')
    : null

export function parseCommandLineArgv(commandLine: string): string[] {
  if (!nativeModule) {
    throw new Error(
      `The windows-argv-parser module is only available on Windows`
    )
  }

  return nativeModule.parseCommandLineArgv(commandLine)
}
