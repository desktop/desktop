// type annotations for package.json dependencies
type PackageLookup = { [key: string]: string }

type Package = {
  dependencies: PackageLookup
  devDependencies: PackageLookup
}

declare namespace NodeJS {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Process extends EventEmitter {
    on(event: 'unhandledRejection', listener: (error: Error) => void): this
  }
}
