import { parseEnumValue } from '../../src/lib/enum'

enum TestEnum {
  Foo = 'foo',
  Bar = 'bar is the thing',
}

describe('parseEnumValue', () => {
  it('parses an enum type from a string', () => {
    expect(parseEnumValue(TestEnum, 'foo')).toBe(TestEnum.Foo)
    expect(parseEnumValue(TestEnum, TestEnum.Foo)).toBe(TestEnum.Foo)
    expect(parseEnumValue(TestEnum, 'bar is the thing')).toBe(TestEnum.Bar)
    expect(parseEnumValue(TestEnum, TestEnum.Bar)).toBe(TestEnum.Bar)
  })

  it("returns undefined when enum value doesn't exist", () => {
    expect(parseEnumValue(TestEnum, 'baz')).toBe(undefined)
  })

  it('ignores inherited values', () => {
    // Note: The only way I can think of that this would happen is if someone
    // monkey-patches Object but we're not going to taint the test suite for
    // that so we'll create a fake enum
    const parent = Object.create(null)
    parent.foo = 'bar'

    const child = Object.create(parent)

    expect('foo' in child).toBeTrue()
    expect(child.foo).toBe('bar')
    expect(parseEnumValue(child, 'bar')).toBe(undefined)
  })
})
