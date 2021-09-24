enum ProgrammingLanguage {
  JavaScript,
  TypeScript,
  HTML,
  Java,
}

function describeProgrammingLanguage(language: ProgrammingLanguage): string {
  switch (language) {
    case ProgrammingLanguage.JavaScript:
      return `Yeah.. It is pretty good.`
    case ProgrammingLanguage.TypeScript:
      return 'Better than javascript.'
    case ProgrammingLanguage.HTML:
      return 'Are you sure that is a programming language? - The real changes'
    case ProgrammingLanguage.Java:
      return 'Java java!'
    default:
      return `Don't know  what you are talking about..`
  }
}


describe('universe-demo-describeProgrammingLanguage', () => {
  it('describes  javascript', () => {
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

function getProgrammingLanguageName(language: ProgrammingLanguage): string {
  switch (language) {
    case ProgrammingLanguage.JavaScript:
      return `JavaScript`
    case ProgrammingLanguage.TypeScript:
      return 'TypeScript'
    case ProgrammingLanguage.HTML:
      return 'HyperText Markup Language'
    case ProgrammingLanguage.CSS:
      return 'Cascading Style Sheets'
    case ProgrammingLanguage.Java:
      return 'Java java!'
    default:
      return `Don't know what you are talking about..`
  }
}

describe('universe-demo-getProgrammingLanguageName', () => {
  it('gets javascript name', () => {
    const result = getProgrammingLanguageName(ProgrammingLanguage.JavaScript)
    expect(result).toBe('JavaScript')
  })

  it('gets java name', () => {
    const result = getProgrammingLanguageName(ProgrammingLanguage.Java)
    expect(result).toBe(`Java java!`)
  })
})
