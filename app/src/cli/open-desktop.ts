import * as ChildProcess from 'child_process'

export function openDesktop (url: string) {
  const env = { ...process.env }
  // NB: We're gonna launch Desktop and we definitely don't want to carry over
  // `ELECTRON_RUN_AS_NODE`. This seems to only happen on Windows.
  delete env['ELECTRON_RUN_AS_NODE']

  let command
  switch (process.platform) {
    case 'win32':
      command = 'start'
      break
    default:
      command = 'open'
  }
  return ChildProcess.spawn(command, [url], { env })
}
