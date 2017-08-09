import * as Path from 'path'

import { ICommandModule, mriArgv } from '../load-commands'
import { openDesktop } from '../open-desktop'

interface IOpenArgs extends mriArgv {
  readonly path: string
}

const command: ICommandModule = {
  command: 'open [path]',
  aliases: ['[path]'],
  description: 'Open a git repository in GitHub Desktop',
  args: [
    {
      name: 'path',
      description: 'The path to the repository to open. Defaults to `.`',
      type: 'string',
      required: false,
    },
  ],
  handler({ _: [pathArg] }: IOpenArgs) {
    const repositoryPath = Path.resolve(process.cwd(), pathArg || '.')
    const url = `x-github-client://openLocalRepo/${encodeURIComponent(
      repositoryPath
    )}`
    openDesktop(url)
  },
}
export = command
