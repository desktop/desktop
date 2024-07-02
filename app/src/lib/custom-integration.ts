export interface ICustomIntegration {
  readonly path: string
  readonly arguments: ReadonlyArray<string>
  readonly bundleId?: string
}
