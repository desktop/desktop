import { Repository } from '../../models/repository'
import { git } from '.'

export async function getStashSize(repository: Repository): Promise<number> {
  const delimiter = '1F'
  const format = ['%gd', '%H', '%gs'].join(`%x${delimiter}`)

  const result = await git(
    ['log', '-g', '-z', `--pretty=${format}`, 'refs/stash'],
    repository.path,
    'getStashSize',
    {
      successExitCodes: new Set([0, 128]),
    }
  )

  // There's no refs/stashes reflog in the repository or it's not
  // even a repository. In either case we don't care
  if (result.exitCode === 128) {
    return 0
  }

  const stashEntries = result.stdout.split('\0').filter(s => s !== '')

  return stashEntries.length
}
