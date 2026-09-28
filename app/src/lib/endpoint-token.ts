export type EndpointToken = {
  endpoint: string
  token: string
  /** When present, this token applies only to assets in this repository. */
  repositoryURL?: string
}
