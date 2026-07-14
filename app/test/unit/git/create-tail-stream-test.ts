import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Readable } from 'stream'
import { createTailStream } from '../../../src/lib/git/create-tail-stream'

describe('createTailStream', () => {
  it('only keeps the tail of the input stream', async () => {
    const write = (maxLength: number, ...chunks: string[]) =>
      Readable.from(chunks)
        .pipe(createTailStream(maxLength, { encoding: 'utf8' }))
        .toArray()

    assert.deepStrictEqual(await write(3, 'hello'), ['llo'])
    assert.deepStrictEqual(await write(5, 'hello'), ['hello'])
    assert.deepStrictEqual(await write(10, 'hello', 'world'), ['helloworld'])
    assert.deepStrictEqual(await write(8, 'hello', 'world'), ['lloworld'])
    assert.deepStrictEqual(
      await write(10, '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
      ['0123456789']
    )
    assert.deepStrictEqual(
      await write(8, '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
      ['23456789']
    )

    assert.deepStrictEqual(await write(8, ...'helloworld'), ['lloworld'])
  })
})
