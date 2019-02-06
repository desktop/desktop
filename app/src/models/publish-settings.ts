import { IAPIUser } from '../lib/api'

export type RepositoryPublicationSettings =
  | IEnterprisePublicationSettings
  | IDotcomPublicationSettings

export interface IEnterprisePublicationSettings {
  readonly kind: 'ghe'

  /** The name to use when publishing the repository. */
  readonly name: string

  /** The repository's description. */
  readonly description: string

  /** Should the repository be private? */
  readonly private: boolean
}

export interface IDotcomPublicationSettings {
  readonly kind: 'dotcom'

  /** The name to use when publishing the repository. */
  readonly name: string

  /** The repository's description. */
  readonly description: string

  /** Should the repository be private? */
  readonly private: boolean

  /**
   * The org to which this repository belongs. If null, the repository should be
   * published as a personal repository.
   */
  readonly org: IAPIUser | null
}
