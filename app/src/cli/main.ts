import * as ChildProcess from 'child_process'
import * as Path from 'path'

const args = process.argv.slice(2)

// At some point we may have other command line options, but for now we assume
// the first arg is the path to open.
const pathArg = args.length > 0 ? args[0] : ''
const repositoryPath = Path.resolve(process.cwd(), pathArg)
const url = `x-github-client://openLocalRepo/${encodeURIComponent(repositoryPath)}`

const env = { ... env }
delete env['ELECTRON_RUN_AS_NODE']

const command = __DARWIN__ ? 'open' : 'start'
ChildProcess.exec(`${command} ${url}`, { env })

process.exit(0)
