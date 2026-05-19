import { resolve } from 'path'
import parse from 'minimist'

export type DesktopCLICommand =
  | {
      readonly kind: 'usage'
      readonly exitCode: 0 | 1
    }
  | {
      readonly kind: 'open'
      readonly path: string
    }
  | {
      readonly kind: 'clone'
      readonly url: string
      readonly branch?: string
    }
  | {
      readonly kind: 'add-local'
      readonly paths: ReadonlyArray<string>
    }

export function parseDesktopCLICommand(
  argv: ReadonlyArray<string>
): DesktopCLICommand {
  const args = parse([...argv], {
    alias: { help: 'h', branch: 'b' },
    boolean: ['help'],
    string: ['_', 'branch'],
  })

  if (args.help || args._.at(0) === 'help') {
    return { kind: 'usage', exitCode: 0 }
  }

  if (args._.at(0) === 'clone') {
    const urlArg = args._.at(1)
    // Assume name with owner slug if it looks like it
    const url =
      urlArg && /^[^\/]+\/[^\/]+$/.test(urlArg)
        ? `https://github.com/${urlArg}`
        : urlArg

    if (!url) {
      return { kind: 'usage', exitCode: 1 }
    }

    return typeof args.branch === 'string'
      ? { kind: 'clone', url, branch: args.branch }
      : { kind: 'clone', url }
  }

  if (args._.at(0) === 'add-local') {
    const paths = args._.slice(1).map(path => resolve(path))

    return paths.length > 0
      ? { kind: 'add-local', paths }
      : { kind: 'usage', exitCode: 1 }
  }

  const [firstArg, secondArg] = args._
  const pathArg = firstArg === 'open' ? secondArg : firstArg
  const path = resolve(pathArg ?? '.')

  return { kind: 'open', path }
}
