import { join } from 'path'
import { execFile, spawn } from 'child_process'
import { parseDesktopCLICommand } from './commands'

const run = (...args: Array<string>) => {
  function cb(e: unknown | null, stderr?: string) {
    if (e) {
      console.error(`Error running command ${args}`)
      console.error(stderr ?? `${e}`)
      process.exit(
        typeof e === 'object' && 'code' in e && typeof e.code === 'number'
          ? e.code
          : 1
      )
    }
  }

  if (process.platform === 'darwin') {
    execFile('open', ['-n', join(__dirname, '../../..'), '--args', ...args], cb)
  } else if (process.platform === 'win32') {
    const exeName = `GitHubDesktop${__DEV__ ? '-dev' : ''}.exe`
    spawn(join(__dirname, `../../${exeName}`), args, {
      detached: true,
      stdio: 'ignore',
    })
      .on('error', cb)
      .on('exit', code => (process.exitCode = code ?? process.exitCode))
      .unref()
  } else {
    throw new Error('Unsupported platform')
  }
}

const usage = (exitCode = 1): never => {
  process.stderr.write(
    'GitHub Desktop CLI usage: \n' +
      '  github                            Open the current directory\n' +
      '  github open [path]                Open the provided path\n' +
      '  github add-local <path...>        Add existing local repositories\n' +
      '  github clone [-b branch] <url>    Clone the repository by url or name/owner\n' +
      '                                    (ex torvalds/linux), optionally checking out\n' +
      '                                    the branch\n'
  )
  process.exit(exitCode)
}

delete process.env.ELECTRON_RUN_AS_NODE

const command = parseDesktopCLICommand(process.argv.slice(2))

if (command.kind === 'usage') {
  usage(command.exitCode)
} else if (command.kind === 'clone') {
  if (command.branch) {
    run(`--cli-clone=${command.url}`, `--cli-branch=${command.branch}`)
  } else {
    run(`--cli-clone=${command.url}`)
  }
} else if (command.kind === 'add-local') {
  run(...command.paths.map(path => `--cli-add-local=${path}`))
} else {
  run(`--cli-open=${command.path}`)
}
