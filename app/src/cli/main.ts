import * as ChildProcess from 'child_process'
import * as Path from 'path'

const args = process.argv.slice(2)

// At some point we may have other command line options, but for now we assume
// the first arg is the path to open.
const pathArg = args.length > 0 ? args[0] : null
const repositoryPath = pathArg ? Path.resolve(process.cwd(), pathArg) : ''
const url = `x-github-client://openLocalRepo/${encodeURIComponent(
  repositoryPath
)}`

const env = { ...process.env }
// NB: We're gonna launch Desktop and we definitely don't want to carry over
// `ELECTRON_RUN_AS_NODE`. This seems to only happen on Windows.
delete env['ELECTRON_RUN_AS_NODE']

const command = __DARWIN__ ? 'open' : 'start'
ChildProcess.exec(`${command} ${url}`, { env })
