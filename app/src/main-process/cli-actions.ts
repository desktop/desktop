import { CLIAction } from '../lib/cli-action'

type ParsedCommandLineArgs = {
  readonly [key: string]: unknown
}

export function getCLIActionFromCommandLineArgs(
  args: ParsedCommandLineArgs
): CLIAction | null {
  if (typeof args['cli-open'] === 'string') {
    return { kind: 'open-repository', path: args['cli-open'] }
  }

  const addLocalPaths = getStringValues(args['cli-add-local'])

  if (addLocalPaths.length > 0) {
    return { kind: 'add-local-repositories', paths: addLocalPaths }
  }

  if (typeof args['cli-clone'] === 'string') {
    return {
      kind: 'clone-url',
      url: args['cli-clone'],
      branch:
        typeof args['cli-branch'] === 'string' ? args['cli-branch'] : undefined,
    }
  }

  return null
}

function getStringValues(value: unknown): ReadonlyArray<string> {
  if (typeof value === 'string') {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  return []
}
