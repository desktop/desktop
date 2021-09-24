describe('universe-demo-describeProgrammingLanguage', () => {
  it('describes javascript', () => {
    const result = describeProgrammingLanguage(ProgrammingLanguage.JavaScript)
    expect(result).toBe('Yeah..  It is pretty good.')
  })

  it('cannot describe java', () => {
    const result = describeProgrammingLanguage(ProgrammingLanguage.Java)
    expect(result).toBe(
      `Don't know what you are talking  about.. Another change`
    )
  })
})
