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
