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

type DistInfo = {
  getDistPath: () => string
  getProductName: () => string
  getCompanyName: () => string
  getVersion: () => string
  getOSXZipName: () => string
  getOSXZipPath: () => string
  getWindowsInstallerName: () => string
  getWindowsInstallerPath: () => string
  getWindowsStandaloneName: () => string
  getWindowsStandalonePath: () => string
  getWindowsFullNugetPackageName: () => string
  getWindowsFullNugetPackagePath: () => string
  getBundleID: () => string
  getUserDataPath: () => string
  getWindowsIdentifierName: () => string
  getBundleSizes: () => { rendererSize: number; mainSize: number }
  getReleaseChannel: () => string | null
  getReleaseSHA: () => string | null
  getUpdatesURL: () => string
  getWindowsDeltaNugetPackageName: () => string
  getWindowsDeltaNugetPackagePath: () => string
  shouldMakeDelta: () => boolean
  getReleaseBranchName: () => string
  getExecutableName: () => string
  getSHA: () => string
}
