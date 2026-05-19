export type CLIAction =
  | {
      readonly kind: 'open-repository'
      readonly path: string
    }
  | {
      readonly kind: 'add-local-repositories'
      readonly paths: ReadonlyArray<string>
    }
  | {
      readonly kind: 'clone-url'
      readonly url: string
      readonly branch?: string
    }
