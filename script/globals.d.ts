// type annotations for package.json dependencies
type PackageLookup = { [key: string]: string }

type Package = {
  dependencies: PackageLookup
  devDependencies: PackageLookup
}

// type declarations for legal-eagle
type LicenseLookup = {
  [key: string]: LicenseEntry
}

type LegalEagleOptions = {
  path: string
  overrides: LicenseLookup
  omitPermissive?: boolean
}

type LicenseEntry = {
  license: string
  source: string
  repository: string
  sourceText: string
}

type LegalEagle = (
  options: LegalEagleOptions,
  callback: (error: Error | null, summary: LicenseLookup) => void
) => void

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
