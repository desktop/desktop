const suppressedUrls = new Set<string>()

export function suppressCertificateErrorFor(url: string) {
  suppressedUrls.add(url)
}

export function clearCertificateErrorSuppressionFor(url: string) {
  suppressedUrls.delete(url)
}

export function isCertificateErrorSuppressedFor(url: string) {
  return suppressedUrls.has(url)
}
