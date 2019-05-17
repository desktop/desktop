const appPackage: Record<string, string> = require('./package.json')

export function getProductName() {
  const productName = appPackage.productName
  let suffix = ''
  const env = process.env.NODE_ENV
  if (env === 'development') {
    suffix = '-dev'
  } else if (env === 'ui-test') {
    suffix = '-ui-test'
  }

  return `${productName}${suffix}`
}

export function getCompanyName() {
  return appPackage.companyName
}

export function getVersion() {
  return appPackage.version
}

export function getBundleID() {
  return appPackage.bundleID
}
