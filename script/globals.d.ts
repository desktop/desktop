type Package = {
  productName?: string
  dependencies: Record<string, string>
  devDependencies?: Record<string, string>
}

declare namespace NodeJS {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Process extends EventEmitter {
    on(event: 'unhandledRejection', listener: (error: Error) => void): this
  }
}
