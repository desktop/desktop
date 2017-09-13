import * as ChildProcess from 'child_process'

export function openDesktop(url: string = '') {
  const env = { ...process.env }
  // NB: We're gonna launch Desktop and we definitely don't want to carry over
  // `ELECTRON_RUN_AS_NODE`. This seems to only happen on Windows.
  delete env['ELECTRON_RUN_AS_NODE']

  url = 'x-github-client://' + url

  if (__DARWIN__) {
    return ChildProcess.spawn('open', [url], { env })
  } else if (__WIN32__) {
    return ChildProcess.spawn('cmd', ['/c', 'start', url], { env })
  } else {
    throw new Error(
      `Desktop command line interface not currently supported on platform ${process.platform}`
    )
  }
}
