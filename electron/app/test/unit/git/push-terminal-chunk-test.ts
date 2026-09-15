import { describe, it } from 'node:test'
import assert from 'node:assert'
import { pushTerminalChunk } from '../../../src/lib/git/push-terminal-chunk'

describe('pushTerminalChunk', () => {
  describe('basic functionality', () => {
    it('appends a string chunk to an empty buffer', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 100, 'hello')
      assert.deepEqual(chunks, ['hello'])
    })

    it('appends multiple string chunks', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 100, 'hello')
      pushTerminalChunk(chunks, 100, ' world')
      assert.deepEqual(chunks, ['hello', ' world'])
    })

    it('appends a Buffer chunk by converting it to string', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 100, Buffer.from('hello'))
      assert.deepEqual(chunks, ['hello'])
    })

    it('appends an empty string chunk', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 100, '')
      assert.deepEqual(chunks, [''])
    })

    it('appends an empty Buffer chunk', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 100, Buffer.from(''))
      assert.deepEqual(chunks, [''])
    })
  })

  describe('capacity management', () => {
    it('does not trim when total length equals capacity', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 10, '0123456789')
      assert.deepEqual(chunks, ['0123456789'])
      assert.equal(chunks.join('').length, 10)
    })

    it('does not trim when total length is under capacity', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 10, '12345')
      assert.deepEqual(chunks, ['12345'])
    })

    it('removes entire first chunk when overrun exceeds first chunk length', () => {
      const chunks: string[] = ['abc', 'def']
      pushTerminalChunk(chunks, 6, 'ghij')
      // Total would be 10, capacity is 6, overrun is 4
      // First chunk 'abc' has length 3, so it's removed entirely
      // Remaining overrun is 1, so 'def' becomes 'ef'
      assert.deepEqual(chunks, ['ef', 'ghij'])
      assert.equal(chunks.join('').length, 6)
    })

    it('partially trims first chunk when overrun is less than first chunk length', () => {
      const chunks: string[] = ['abcdef']
      pushTerminalChunk(chunks, 8, 'ghi')
      // Total would be 9, capacity is 8, overrun is 1
      // First chunk 'abcdef' is trimmed by 1 character from the start
      assert.deepEqual(chunks, ['bcdef', 'ghi'])
      assert.equal(chunks.join('').length, 8)
    })

    it('removes multiple chunks when necessary', () => {
      const chunks: string[] = ['aa', 'bb', 'cc']
      pushTerminalChunk(chunks, 4, 'dddd')
      // Total would be 10, capacity is 4, need to remove 6 characters
      // Remove 'aa' (2), remove 'bb' (2), remove 'cc' (2) = 6 removed
      assert.deepEqual(chunks, ['dddd'])
      assert.equal(chunks.join('').length, 4)
    })

    it('handles single chunk that exceeds capacity', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 5, '0123456789')
      // Chunk of 10 chars, capacity of 5
      // Should trim from the beginning to fit exactly 5 chars
      assert.deepEqual(chunks, ['56789'])
      assert.equal(chunks.join('').length, 5)
    })

    it('handles capacity of zero', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 0, 'hello')
      // Everything should be trimmed, including the empty chunk
      assert.deepEqual(chunks, [])
      assert.equal(chunks.join('').length, 0)
    })

    it('handles capacity of one', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 1, 'hello')
      assert.deepEqual(chunks, ['o'])
      assert.equal(chunks.join('').length, 1)
    })
  })

  describe('rolling buffer behavior', () => {
    it('maintains rolling buffer with repeated pushes', () => {
      const chunks: string[] = []
      const capacity = 15

      pushTerminalChunk(chunks, capacity, 'aaaaa') // 5 chars
      assert.equal(chunks.join('').length, 5)

      pushTerminalChunk(chunks, capacity, 'bbbbb') // 10 chars total
      assert.equal(chunks.join('').length, 10)

      pushTerminalChunk(chunks, capacity, 'ccccc') // 15 chars total
      assert.equal(chunks.join('').length, 15)

      pushTerminalChunk(chunks, capacity, 'ddddd') // would be 20, trimmed to 15
      assert.equal(chunks.join('').length, 15)
      assert.equal(chunks.join(''), 'bbbbbcccccddddd')

      pushTerminalChunk(chunks, capacity, 'eeeee') // would be 20, trimmed to 15
      assert.equal(chunks.join('').length, 15)
      assert.equal(chunks.join(''), 'cccccdddddeeeee')
    })

    it('preserves newest content when trimming', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 10, 'old_data_')
      pushTerminalChunk(chunks, 10, 'new_data')
      // The newest content should be preserved
      const result = chunks.join('')
      assert.ok(result.endsWith('new_data'))
      assert.equal(result.length, 10)
    })
  })

  describe('edge cases', () => {
    it('handles unicode characters correctly (counts characters, not bytes)', () => {
      const chunks: string[] = []
      // '日本語' is 3 characters but 9 bytes in UTF-8
      pushTerminalChunk(chunks, 5, '日本語ab')
      // Should count as 5 characters, not 11 bytes
      assert.deepEqual(chunks, ['日本語ab'])
      assert.equal(chunks.join('').length, 5)
    })

    it('trims unicode characters correctly', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 3, '日本語test')
      // 7 characters, capacity 3, need to trim 4 from start
      assert.deepEqual(chunks, ['est'])
      assert.equal(chunks.join('').length, 3)
    })

    it('handles emoji characters', () => {
      const chunks: string[] = []
      // Note: some emoji are 2 code units in JS strings
      pushTerminalChunk(chunks, 10, '👋hello')
      // '👋' counts as 2 in JavaScript string length
      assert.equal(chunks.join('').length, 7) // 2 + 5
    })

    it('handles mixed Buffer and string inputs', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 30, 'string_input')
      pushTerminalChunk(chunks, 30, Buffer.from('_buffer_input'))
      assert.deepEqual(chunks, ['string_input', '_buffer_input'])
    })

    it('handles newlines and special characters', () => {
      const chunks: string[] = []
      pushTerminalChunk(chunks, 20, 'line1\nline2\r\n')
      assert.deepEqual(chunks, ['line1\nline2\r\n'])
    })

    it('handles ANSI escape sequences', () => {
      const chunks: string[] = []
      const ansiColored = '\x1b[31mred\x1b[0m'
      pushTerminalChunk(chunks, 50, ansiColored)
      assert.deepEqual(chunks, [ansiColored])
    })
  })

  describe('pre-existing buffer state', () => {
    it('works correctly with pre-populated buffer', () => {
      const chunks: string[] = ['existing', 'content']
      pushTerminalChunk(chunks, 20, '_new')
      assert.deepEqual(chunks, ['existing', 'content', '_new'])
    })

    it('trims pre-existing content when adding new chunk exceeds capacity', () => {
      const chunks: string[] = ['aaaa', 'bbbb'] // 8 chars
      pushTerminalChunk(chunks, 10, 'cccccc') // would be 14, capacity 10
      // Need to trim 4 chars from start
      // 'aaaa' is removed entirely (4 chars), overrun satisfied
      assert.deepEqual(chunks, ['bbbb', 'cccccc'])
      assert.equal(chunks.join('').length, 10)
    })
  })

  describe('boundary conditions', () => {
    it('handles exact capacity boundary', () => {
      const chunks: string[] = ['12345']
      pushTerminalChunk(chunks, 10, '67890')
      assert.deepEqual(chunks, ['12345', '67890'])
      assert.equal(chunks.join('').length, 10)
    })

    it('handles one character over capacity', () => {
      const chunks: string[] = ['12345']
      pushTerminalChunk(chunks, 10, '678901')
      // Total 11, capacity 10, overrun 1
      assert.equal(chunks.join('').length, 10)
      assert.equal(chunks.join(''), '2345678901')
    })

    it('handles very large capacity with small chunks', () => {
      const chunks: string[] = []
      const capacity = 1000000
      pushTerminalChunk(chunks, capacity, 'small')
      assert.deepEqual(chunks, ['small'])
    })

    it('handles many small chunks', () => {
      const chunks: string[] = []
      const capacity = 20

      for (let i = 0; i < 10; i++) {
        pushTerminalChunk(chunks, capacity, 'xx')
      }

      // 10 chunks of 'xx' = 20 chars, exactly at capacity
      assert.equal(chunks.join('').length, 20)
    })

    it('correctly handles while loop with exact chunk removal', () => {
      // Set up scenario where overrun exactly equals first chunk length
      const chunks: string[] = ['abc'] // 3 chars
      pushTerminalChunk(chunks, 5, 'defgh') // would be 8, capacity 5, overrun exactly 3
      // 'abc' should be removed entirely
      assert.deepEqual(chunks, ['defgh'])
      assert.equal(chunks.join('').length, 5)
    })
  })

  describe('realistic terminal output scenarios', () => {
    it('simulates git push output', () => {
      const chunks: string[] = []
      const capacity = 1000

      pushTerminalChunk(chunks, capacity, 'Enumerating objects: 5, done.\n')
      pushTerminalChunk(
        chunks,
        capacity,
        'Counting objects: 100% (5/5), done.\n'
      )
      pushTerminalChunk(
        chunks,
        capacity,
        'Delta compression using up to 8 threads\n'
      )
      pushTerminalChunk(
        chunks,
        capacity,
        'Compressing objects: 100% (3/3), done.\n'
      )
      pushTerminalChunk(
        chunks,
        capacity,
        'Writing objects: 100% (3/3), 328 bytes | 328.00 KiB/s, done.\n'
      )

      const result = chunks.join('')
      assert.ok(result.includes('Enumerating'))
      assert.ok(result.includes('Writing objects'))
    })

    it('simulates progress output with carriage returns', () => {
      const chunks: string[] = []
      const capacity = 100

      // Simulate progress updates that overwrite each other
      pushTerminalChunk(chunks, capacity, 'Progress: 25%\r')
      pushTerminalChunk(chunks, capacity, 'Progress: 50%\r')
      pushTerminalChunk(chunks, capacity, 'Progress: 75%\r')
      pushTerminalChunk(chunks, capacity, 'Progress: 100%\n')

      const result = chunks.join('')
      assert.ok(result.includes('Progress: 100%'))
    })

    it('handles large output that needs significant trimming', () => {
      const chunks: string[] = []
      const capacity = 100

      // Add a lot of output
      for (let i = 0; i < 50; i++) {
        pushTerminalChunk(chunks, capacity, `Line ${i}: Some output data\n`)
      }

      const result = chunks.join('')
      assert.equal(result.length, 100)
      // Should contain only the most recent content
      assert.ok(!result.includes('Line 0:'))
    })
  })
})
