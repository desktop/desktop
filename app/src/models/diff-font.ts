const diffFontLigaturesOff = '"liga" off, "calt" off'
const diffFontLigaturesOn = '"liga" on, "calt" on'
const minimumDiffFontSize = 6
const maximumDiffFontSize = 100

const legacyDiffFontFamilies = new Map<string, string>([
  ['default', ''],
  ['cascadia-mono', '"Cascadia Mono", "Cascadia Code"'],
  ['consolas', 'Consolas, "Lucida Console"'],
  ['fira-code', 'Fira Code'],
  ['jetbrains-mono', 'JetBrains Mono'],
  ['courier-new', '"Courier New", Courier'],
])

export const defaultDiffFontFamily = ''
export const defaultDiffFontSize = 11
export const defaultDiffFontWeight = 'normal'
export const defaultDiffFontLigatures = 'false'

export function clampDiffFontSize(value: number) {
  if (isNaN(value) || value === 0) {
    return defaultDiffFontSize
  }

  return Math.max(minimumDiffFontSize, Math.min(maximumDiffFontSize, value))
}

export function normalizeDiffFontFamily(fontFamily: string) {
  const normalized = fontFamily.trim()
  return legacyDiffFontFamilies.get(normalized) ?? normalized
}

export function normalizeDiffFontWeight(fontWeight: string) {
  const normalized = fontWeight.trim()

  if (normalized === 'normal' || normalized === 'bold') {
    return normalized
  }

  if (!/^(1000|[1-9][0-9]{0,2})$/.test(normalized)) {
    return defaultDiffFontWeight
  }

  const numericWeight = parseInt(normalized, 10)
  return String(Math.max(1, Math.min(1000, numericWeight)))
}

export function normalizeDiffFontLigatures(fontLigatures: string) {
  const normalized = fontLigatures.trim()

  if (normalized.length === 0 || normalized === 'false') {
    return defaultDiffFontLigatures
  }

  if (normalized === 'true') {
    return 'true'
  }

  return normalized
}

function wrapDiffFontFamilyInQuotes(fontFamily: string) {
  if (/[,"']/.test(fontFamily)) {
    return fontFamily
  }

  if (/[+ ]/.test(fontFamily)) {
    return `"${fontFamily}"`
  }

  return fontFamily
}

export function getDiffFontFamilyCssValue(fontFamily: string) {
  const normalized = normalizeDiffFontFamily(fontFamily)
  const fallbackFontFamily = 'var(--font-family-monospace)'

  if (normalized.length === 0) {
    return fallbackFontFamily
  }

  const massagedFontFamily = wrapDiffFontFamilyInQuotes(normalized)
  return `${massagedFontFamily}, ${fallbackFontFamily}`
}

export function getDiffFontWeightCssValue(fontWeight: string) {
  return normalizeDiffFontWeight(fontWeight)
}

export function getDiffFontLigaturesCssValue(fontLigatures: string) {
  const normalized = normalizeDiffFontLigatures(fontLigatures)

  if (normalized === 'true') {
    return diffFontLigaturesOn
  }

  if (normalized === 'false') {
    return diffFontLigaturesOff
  }

  return normalized
}

function isFontFeatureEnabled(featureSettings: string, featureTag: string) {
  const escapedFeatureTag = featureTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `["']${escapedFeatureTag}["'](?:\\s+(on|off|1|0))?(?=\\s*(?:,|$))`,
    'i'
  )

  const match = featureSettings.match(pattern)
  if (match === null) {
    return false
  }

  const value = match[1]?.toLowerCase()
  return value !== 'off' && value !== '0'
}

export function hasDiffCommonLigaturesEnabled(fontLigatures: string) {
  const normalized = normalizeDiffFontLigatures(fontLigatures)

  if (normalized === 'true') {
    return true
  }

  if (normalized === 'false') {
    return false
  }

  return isFontFeatureEnabled(normalized, 'liga')
}

export function getDiffLineHeight(diffFontSize: number) {
  return Math.max(20, clampDiffFontSize(diffFontSize) + 8)
}
