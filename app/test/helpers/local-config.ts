import { Repository } from '../../src/models/repository'
import { GitProcess } from 'dugite'

export async function setupLocalConfig(
  repository: Repository,
  localConfig: Iterable<[string, string]>
) {
  for (const [key, value] of localConfig) {
    await GitProcess.exec(['config', key, value], repository.path)
  }
}
