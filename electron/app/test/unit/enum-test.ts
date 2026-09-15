import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseEnumValue } from '../../src/lib/enum'

enum TestEnum {
  Foo = 'foo',
  Bar = 'bar is the thing',
}

describe('parseEnumValue', () => {
  it('parses an enum type from a string', () => {
    assert.equal(parseEnumValue(TestEnum, 'foo'), TestEnum.Foo)
    assert.equal(parseEnumValue(TestEnum, TestEnum.Foo), TestEnum.Foo)
    assert.equal(parseEnumValue(TestEnum, 'bar is the thing'), TestEnum.Bar)
    assert.equal(parseEnumValue(TestEnum, TestEnum.Bar), TestEnum.Bar)
  })

  it("returns undefined when enum value doesn't exist", () => {
    assert.equal(parseEnumValue(TestEnum, 'baz'), undefined)
  })

  it('ignores inherited values', () => {
    // Note: The only way I can think of that this would happen is if someone
    // monkey-patches Object but we're not going to taint the test suite for
    // that so we'll create a fake enum
    const parent = Object.create(null)
    parent.foo = 'bar'

    const child = Object.create(parent)

    assert('foo' in child)
    assert.equal(child.foo, 'bar')
    assert.equal(parseEnumValue(child, 'bar'), undefined)
  })
})
