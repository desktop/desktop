const appPackage: Record<string, string> = require('./package.json')

export function getProductName() {
  const productName = appPackage.productName
  return process.env.NODE_ENV === 'development'
    ? `${productName}-dev`
    : productName
}

export function getCompanyName() {
  return appPackage.companyName
}

export function getVersion() {
  return appPackage.version
}

export function getBundleID() {
  return process.env.NODE_ENV === 'development'
    ? `${appPackage.bundleID}Dev`
    : appPackage.bundleID
}
