import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { convertDDSImage } from '../../src/ui/diff/image-diffs/dds-converter'

describe('convertDDSImage', () => {
  for (const BufferType of [ArrayBuffer, SharedArrayBuffer]) {
    it(`renders DXT1 pixels from ${BufferType.name}`, async t => {
      const contents = new BufferType(136)
      const header = new Int32Array(contents, 0, 31)
      header[0] = 0x20534444
      header[1] = 124
      header[3] = 4
      header[4] = 4
      header[20] = 4
      header[21] = 0x31545844
      const pixels = new Uint8Array(contents, 128, 8)
      pixels.set([1, 2, 3, 4, 5, 6, 7, 8])

      const gl = {
        createShader: () => ({}),
        shaderSource: () => {},
        compileShader: () => {},
        getShaderParameter: () => true,
        createProgram: () => ({}),
        attachShader: () => {},
        linkProgram: () => {},
        getProgramParameter: () => true,
        createBuffer: () => ({}),
        bindBuffer: () => {},
        bufferData: () => {},
        createVertexArray: () => ({}),
        bindVertexArray: () => {},
        enableVertexAttribArray: () => {},
        vertexAttribPointer: () => {},
        drawArrays: () => {},
        createTexture: () => ({}),
        bindTexture: () => {},
        texParameteri: () => {},
        getExtension: () => ({ COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0 }),
        compressedTexImage2D: t.mock.fn(),
        useProgram: () => {},
        viewport: () => {},
      }
      t.mock.method(HTMLCanvasElement.prototype, 'getContext', () => gl)
      const toDataURL = t.mock.method(
        HTMLCanvasElement.prototype,
        'toDataURL',
        () => 'data:image/png;base64,test'
      )

      assert.equal(convertDDSImage(contents), 'data:image/png;base64,test')
      assert.equal(gl.compressedTexImage2D.mock.callCount(), 1)
      const args = gl.compressedTexImage2D.mock.calls[0].arguments
      assert.equal(args[2], 0x83f0)
      assert.equal(args[3], 4)
      assert.equal(args[4], 4)
      const imageData = args[6]
      assert.ok(imageData instanceof Uint8Array)
      assert.ok(imageData.buffer instanceof ArrayBuffer)
      assert.deepEqual(Array.from(imageData), Array.from(pixels))
      assert.deepEqual(toDataURL.mock.calls[0].arguments, ['image/png', 1])
    })
  }
})
