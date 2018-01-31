// type annotations for package.json dependencies
type PackageLookup = { [key: string]: string }

type Package = {
  dependencies: PackageLookup
  devDependencies: PackageLookup
}

// type declarations for electron-installer-redhat
type RedhatOptions = {
  src: string
  dest: string
  arch: string
}

type ElectronInstallerRedhat = (
  options: RedhatOptions,
  callback: (error: Error | null) => void
) => void

// type declarations for electron-installer-debian
type DebianOptions = {
  src: string
  dest: string
  arch: string
}

type ElectronInstallerDebian = (
  options: DebianOptions,
  callback: (error: Error | null) => void
) => void

// type declarations for electron-installer-appimage
type AppImageOptions = {
  dir: string
  targetArch: string
}

type ElectronInstallerAppImage = {
  default: (options: AppImageOptions) => Promise<void>
}

declare namespace NodeJS {
  // eslint-disable-next-line typescript/interface-name-prefix
  interface Process extends EventEmitter {
    on(event: 'unhandledRejection', listener: (error: Error) => void): this
  }
}
