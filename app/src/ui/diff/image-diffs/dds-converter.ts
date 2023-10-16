import parseDDS from 'parse-dds'
import triangle from 'a-big-triangle'
import createShader from 'gl-shader'

const vert = `
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = (position + 1.0) * 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(position, 1.0, 1.0);
}
`

const frag = `
precision mediump float;

varying vec2 vUv;
uniform sampler2D tex0;

void main() {
  gl_FragColor = texture2D(tex0, vUv);
}
`

function getFormat(ext: WEBGL_compressed_texture_s3tc, ddsFormat: string) {
  switch (ddsFormat) {
    case 'dxt1':
      return ext.COMPRESSED_RGB_S3TC_DXT1_EXT
    case 'dxt3':
      return ext.COMPRESSED_RGBA_S3TC_DXT3_EXT
    case 'dxt5':
      return ext.COMPRESSED_RGBA_S3TC_DXT5_EXT
    default:
      throw new Error('Unsupported format ' + ddsFormat)
  }
}

function drawToCanvas(
  canvas: HTMLCanvasElement,
  format: string,
  width: number,
  height: number,
  imageData: ArrayBufferView
) {
  canvas.width = width
  canvas.height = height
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
  if (!gl) {
    throw new Error('Failed to get webgl2 context')
  }

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  const ext = gl.getExtension('WEBGL_compressed_texture_s3tc')
  if (!ext) {
    throw new Error('Failed to get WEBGL_compressed_texture_s3tc extension')
  }

  const internalFormat = getFormat(ext, format)
  gl.compressedTexImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    height,
    0,
    imageData
  )

  const shader = createShader(gl, vert, frag)
  shader.bind()

  gl.viewport(0, 0, width, height)
  triangle(gl)
}

export function convertDDSImage(contents: ArrayBufferLike) {
  const ddsData = parseDDS(contents)

  // Get the first mipmap texture.
  const [image] = ddsData.images
  const [imageWidth, imageHeight] = image.shape
  const imageData = new Uint8Array(contents, image.offset, image.length)

  // Draw the DXT texture to the canvas using WebGL2.
  const canvas = document.createElement('canvas')
  drawToCanvas(canvas, ddsData.format, imageWidth, imageHeight, imageData)

  const mediaType = 'image/png'
  const dataURL = canvas.toDataURL(mediaType, 1.0)
  return dataURL
}
