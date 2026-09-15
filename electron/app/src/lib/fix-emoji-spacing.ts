// This module renders an element with an emoji using
// a non system-default font to workaround an Chrome
// issue that causes unexpected spacing on emojis.
// More info:
// https://bugs.chromium.org/p/chromium/issues/detail?id=1113293

const container = document.createElement('div')
container.style.setProperty('visibility', 'hidden')
container.style.setProperty('position', 'absolute')

// Keep this array synced with the font size variables
// in _variables.scss
const fontSizes = [
  '--font-size',
  '--font-size-sm',
  '--font-size-md',
  '--font-size-lg',
  '--font-size-xl',
  '--font-size-xxl',
  '--font-size-xs',
]

for (const fontSize of fontSizes) {
  const span = document.createElement('span')
  span.style.setProperty('font-size', `var(${fontSize}`)
  span.style.setProperty('font-family', 'Arial', 'important')
  span.textContent = '🤦🏿‍♀️'
  container.appendChild(span)
}

document.body.appendChild(container)

// Read the dimensions of the element to force the browser to do a layout.
container.offsetHeight.toString()

// Browser has rendered the emojis, now we can remove them.
document.body.removeChild(container)
