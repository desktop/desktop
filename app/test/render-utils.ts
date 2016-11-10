import * as ReactDOM from 'react-dom'
// import * as Path from 'path'

// const sass = require('node-sass')

// based off the react-virtualized test helper
// https://github.com/bvaughn/react-virtualized/blob/master/source/TestUtils.js

export function getParentNode(stylesheet?: string): HTMLElement {
  const mountNode = document.createElement('div')

  if (stylesheet) {
      const sheet = document.createElement('style')
      sheet.innerHTML = stylesheet
      document.body.appendChild(sheet)
  }

  // Unless we attach the mount-node to body, getBoundingClientRect() won't work
  document.body.appendChild(mountNode)

  afterEach(() => unmount(mountNode))

  return mountNode
}

/**
 * The render() method auto-unmounts components after each test has completed.
 * Use this method manually to test the componentWillUnmount() lifecycle method.
 */
function unmount (mountNode: any) {
  if (mountNode) {
    ReactDOM.unmountComponentAtNode(mountNode)

    document.body.removeChild(mountNode)
  }
}

//export function getStylesheet(): Promise<string> {
//  const root = Path.join(__dirname, '../styles')
//  return new Promise<string>((resolve, reject) => {
//    const path = Path.join(root, 'desktop.scss')
//    sass.render(path, function(err: Error, css: string) {
//        if (err) {
//          reject(err)
//          return
//        }
//        resolve(css)
//    })
//  })
//}
