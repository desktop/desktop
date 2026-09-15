import { Repository } from '../../src/models/repository'
import { exec } from 'dugite'

export async function setupLocalConfig(
  repository: Repository,
  localConfig: Iterable<[string, string]>
) {
  for (const [key, value] of localConfig) {
    await exec(['config', key, value], repository.path)
  }
}
