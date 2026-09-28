import { bundleID, companyName, productName, version } from './package.json'

export function getProductName() {
  if (process.env.RELEASE_CHANNEL === 'custom') {
    return 'GitHub Desktop Custom'
  }
  return process.env.NODE_ENV === 'development'
    ? `${productName}-dev`
    : productName
}

export function getCompanyName() {
  return companyName
}

export function getVersion() {
  return version
}

export function getBundleID() {
  if (process.env.RELEASE_CHANNEL === 'custom') {
    return `${bundleID}Custom`
  }
  return process.env.NODE_ENV === 'development' ? `${bundleID}Dev` : bundleID
}
