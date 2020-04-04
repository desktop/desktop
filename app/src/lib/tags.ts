import { getTags } from './git'
import { Repository } from '../models/repository'

export async function getLocalOnlyTags(
  localBranch: string,
  remoteBranch: string,
  repository: Repository
) {
  const [localBranchTags, remoteBranchTags] = await Promise.all([
    getTags(repository, localBranch),
    getTags(repository, remoteBranch),
  ])
  const onlyLocal = localBranchTags.filter(t => !remoteBranchTags.includes(t))
  return onlyLocal
}
