import chalk from 'chalk'
import * as Path from 'path'

import { ICommandModule, mriArgv } from '../load-commands'
import { openDesktop } from '../open-desktop'
import { parseRemote } from '../../lib/remote-parsing'

export const command: ICommandModule = {
  command: 'open <path>',
  aliases: ['<path>'],
  description: 'Open a git repository in GitHub Desktop',
  args: [
    {
      name: 'path',
      description: 'The path to the repository to open',
      type: 'string',
      required: false,
    },
  ],
  handler({ _: [pathArg] }: mriArgv) {
    if (!pathArg) {
      // just open Desktop
      openDesktop()
      return
    }
    //Check if the pathArg is a remote url
    if (parseRemote(pathArg) != null) {
      console.log(
        `\nYou cannot open a remote URL in GitHub Desktop\n` +
          `Use \`${chalk.bold(`git clone ` + pathArg)}\`` +
          ` instead to initiate the clone`
      )
    } else {
      const repositoryPath = Path.resolve(process.cwd(), pathArg)
      const url = `openLocalRepo/${encodeURIComponent(repositoryPath)}`
      openDesktop(url)
    }
  },
}
