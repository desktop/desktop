import * as Path from 'path'

import { openDesktop } from '../open-desktop'

export const command = 'open [path]'
export const aliases = '* [path]'
export const describe = 'Open a git repository in GitHub Desktop'

interface IOpenArgs {
  path: string
}

export const handler = ({ path: pathArg }: IOpenArgs) => {
  const repositoryPath = Path.resolve(process.cwd(), pathArg || '.')
  const url = `x-github-client://openLocalRepo/${encodeURIComponent(
    repositoryPath
  )}`
  openDesktop(url)
}
