import parseDDS from 'parse-dds'

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

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
) {
  const shader = gl.createShader(type)
  if (!shader) {
    return null
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const errLog = gl.getShaderInfoLog(shader)
    throw new Error('Error compiling shader:\n' + errLog)
  }
  return shader
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vertShader: WebGLShader,
  fragShader: WebGLShader
) {
  const program = gl.createProgram()
  if (!program) {
    return null
  }
  gl.attachShader(program, vertShader)
  gl.attachShader(program, fragShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const errLog = gl.getProgramInfoLog(program)
    throw new Error('Error linking program: ' + errLog)
  }
  return program
}

function compileProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string
) {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertSource)
  if (!vertShader) {
    throw new Error('Failed to compile vertex shader')
  }

  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSource)
  if (!fragShader) {
    throw new Error('Failed to compile fragment shader')
  }

  const program = linkProgram(gl, vertShader, fragShader)
  return program
}

function createBuffer(gl: WebGL2RenderingContext, data: Float32Array) {
  const handle = gl.createBuffer()

  // Bind (setup) buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, handle)

  // Initialize the buffer's data store
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)

  return handle
}

function createVertexArray(gl: WebGL2RenderingContext, buffer: WebGLBuffer) {
  const handle = gl.createVertexArray()
  if (!handle) {
    throw new Error('Failed to create WebGLVertexArrayObject')
  }

  // Bind (setup) vertex array and buffer
  gl.bindVertexArray(handle)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

  // Enable the first generic vertex attribute array
  gl.enableVertexAttribArray(0)

  // Bind the buffer we just bound to `gl.ARRAY_BUFFER` to a generic vertex attribute of the current vertex buffer object
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  // Unbind (cleanup) vertex array
  gl.bindVertexArray(null)

  return handle
}

function triangle(gl: WebGL2RenderingContext) {
  const buffer = createBuffer(gl, new Float32Array([-1, -1, -1, 4, 4, -1]))
  if (!buffer) {
    throw new Error('Failed to create WebGLBuffer')
  }

  // Bind (setup) vertex array and buffer
  const vertexArray = createVertexArray(gl, buffer)
  gl.bindVertexArray(vertexArray)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

  // Draw triangle
  gl.drawArrays(gl.TRIANGLES, 0, 3)

  // Unbind (cleanup) vertex array and buffer
  gl.bindVertexArray(null)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
}

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

  const program = compileProgram(gl, vert, frag)
  gl.useProgram(program)

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
