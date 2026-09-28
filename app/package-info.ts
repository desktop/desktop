import { bundleID, companyName, productName, version } from './package.json'

function isDevelopmentBuild() {
  return (
    (process.env.RELEASE_CHANNEL ?? process.env.NODE_ENV ?? 'development') ===
    'development'
  )
}

export function getProductName() {
  return isDevelopmentBuild() ? `${productName}-dev` : productName
}

export function getCompanyName() {
  return companyName
}

export function getVersion() {
  return version
}

export function getBundleID() {
  return isDevelopmentBuild() ? `${bundleID}Dev` : bundleID
}
