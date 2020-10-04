import { DiffParser } from '../../src/lib/diff-parser'
import { DiffLineType } from '../../src/models/diff'

// Atom doesn't like lines with just one space and tries to
// de-indent so when copying- and pasting diff contents the
// space signalling that the line is a context line gets lost.
//
// This function reinstates that space and makes us all
// feel a little bit sad.
function reinstateSpacesAtTheStartOfBlankLines(text: string) {
  return text.replace(/\n\n/g, '\n \n')
}

describe('DiffParser', () => {
  it('parses changed files', () => {
    const diffText = `diff --git a/app/src/lib/diff-parser.ts b/app/src/lib/diff-parser.ts
index e1d4871..3bd3ee0 100644
--- a/app/src/lib/diff-parser.ts
+++ b/app/src/lib/diff-parser.ts
@@ -18,6 +18,7 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {

     let numberOfUnifiedDiffLines = 0

+
     while (prefixFound) {

       // trim any preceding text
@@ -71,12 +72,9 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {
         diffSections.push(new DiffSection(range, diffLines, startDiffSection, endDiffSection))
       } else {
         const diffBody = diffTextBuffer
-
         let startDiffSection: number = 0
         let endDiffSection: number = 0
-
         const diffLines = diffBody.split('\\n')
-
         if (diffSections.length === 0) {
           startDiffSection = 0
           endDiffSection = diffLines.length
@@ -84,10 +82,8 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {
           startDiffSection = numberOfUnifiedDiffLines
           endDiffSection = startDiffSection + diffLines.length
         }
-
         diffSections.push(new DiffSection(range, diffLines, startDiffSection, endDiffSection))
       }
     }
-
     return new Diff(diffSections)
 }
    `

    const parser = new DiffParser()
    const diff = parser.parse(reinstateSpacesAtTheStartOfBlankLines(diffText))
    expect(diff.hunks).toHaveLength(3)

    let hunk = diff.hunks[0]
    expect(hunk.unifiedDiffStart).toBe(0)
    expect(hunk.unifiedDiffEnd).toBe(7)

    let lines = hunk.lines
    expect(lines).toHaveLength(8)

    let i = 0
    expect(lines[i].text).toBe(
      '@@ -18,6 +18,7 @@ export function parseRawDiff(lines: ReadonlyArray<string>): Diff {'
    )
    expect(lines[i].type).toBe(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBeNull()
    i++

    expect(lines[i].text).toBe(' ')
    expect(lines[i].type).toBe(DiffLineType.Context)
    expect(lines[i].oldLineNumber).toBe(18)
    expect(lines[i].newLineNumber).toBe(18)
    i++

    expect(lines[i].text).toBe('     let numberOfUnifiedDiffLines = 0')
    expect(lines[i].type).toBe(DiffLineType.Context)
    expect(lines[i].oldLineNumber).toBe(19)
    expect(lines[i].newLineNumber).toBe(19)
    i++

    expect(lines[i].text).toBe(' ')
    expect(lines[i].type).toBe(DiffLineType.Context)
    expect(lines[i].oldLineNumber).toBe(20)
    expect(lines[i].newLineNumber).toBe(20)
    i++

    expect(lines[i].text).toBe('+')
    expect(lines[i].type).toBe(DiffLineType.Add)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBe(21)
    i++

    expect(lines[i].text).toBe('     while (prefixFound) {')
    expect(lines[i].type).toBe(DiffLineType.Context)
    expect(lines[i].oldLineNumber).toBe(21)
    expect(lines[i].newLineNumber).toBe(22)
    i++

    hunk = diff.hunks[1]
    expect(hunk.unifiedDiffStart).toBe(8)
    expect(hunk.unifiedDiffEnd).toBe(20)

    lines = hunk.lines
    expect(lines).toHaveLength(13)
  })

  it('parses new files', () => {
    const diffText = `diff --git a/testste b/testste
new file mode 100644
index 0000000..f13588b
--- /dev/null
+++ b/testste
@@ -0,0 +1 @@
+asdfasdf
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.hunks).toHaveLength(1)

    const hunk = diff.hunks[0]
    expect(hunk.unifiedDiffStart).toBe(0)
    expect(hunk.unifiedDiffEnd).toBe(1)

    const lines = hunk.lines
    expect(lines).toHaveLength(2)

    let i = 0
    expect(lines[i].text).toBe('@@ -0,0 +1 @@')
    expect(lines[i].type).toBe(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBeNull()
    i++

    expect(lines[i].text).toBe('+asdfasdf')
    expect(lines[i].type).toBe(DiffLineType.Add)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBe(1)
    i++
  })

  it('parses files containing @@', () => {
    const diffText = `diff --git a/test.txt b/test.txt
index 24219cc..bf711a5 100644
--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-foo @@
+@@ foo
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.hunks).toHaveLength(1)

    const hunk = diff.hunks[0]
    expect(hunk.unifiedDiffStart).toBe(0)
    expect(hunk.unifiedDiffEnd).toBe(2)

    const lines = hunk.lines
    expect(lines).toHaveLength(3)

    let i = 0
    expect(lines[i].text).toBe('@@ -1 +1 @@')
    expect(lines[i].type).toBe(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBeNull()
    i++

    expect(lines[i].text).toBe('-foo @@')
    expect(lines[i].type).toBe(DiffLineType.Delete)
    expect(lines[i].oldLineNumber).toBe(1)
    expect(lines[i].newLineNumber).toBeNull()
    i++

    expect(lines[i].text).toBe('+@@ foo')
    expect(lines[i].type).toBe(DiffLineType.Add)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBe(1)
    i++
  })

  it('parses new files without a newline at end of file', () => {
    const diffText = `diff --git a/test2.txt b/test2.txt
new file mode 100644
index 0000000..faf7da1
--- /dev/null
+++ b/test2.txt
@@ -0,0 +1 @@
+asdasdasd
\\ No newline at end of file
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.hunks).toHaveLength(1)

    const hunk = diff.hunks[0]
    expect(hunk.unifiedDiffStart).toBe(0)
    expect(hunk.unifiedDiffEnd).toBe(1)

    const lines = hunk.lines
    expect(lines).toHaveLength(2)

    let i = 0
    expect(lines[i].text).toBe('@@ -0,0 +1 @@')
    expect(lines[i].type).toBe(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBeNull()
    expect(lines[i].noTrailingNewLine).toBe(false)
    i++

    expect(lines[i].text).toBe('+asdasdasd')
    expect(lines[i].type).toBe(DiffLineType.Add)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBe(1)
    expect(lines[i].noTrailingNewLine).toBe(true)
    i++
  })

  it('parses diffs that adds newline to end of file', () => {
    const diffText = `diff --git a/test2.txt b/test2.txt
index 1910281..257cc56 100644
--- a/test2.txt
+++ b/test2.txt
@@ -1 +1 @@
-foo
\\ No newline at end of file
+foo
`
    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.hunks).toHaveLength(1)

    const hunk = diff.hunks[0]
    expect(hunk.unifiedDiffStart).toBe(0)
    expect(hunk.unifiedDiffEnd).toBe(2)

    const lines = hunk.lines
    expect(lines).toHaveLength(3)

    let i = 0
    expect(lines[i].text).toBe('@@ -1 +1 @@')
    expect(lines[i].type).toBe(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBeNull()
    expect(lines[i].noTrailingNewLine).toBe(false)
    i++

    expect(lines[i].text).toBe('-foo')
    expect(lines[i].type).toBe(DiffLineType.Delete)
    expect(lines[i].oldLineNumber).toBe(1)
    expect(lines[i].newLineNumber).toBeNull()
    expect(lines[i].noTrailingNewLine).toBe(true)
    i++

    expect(lines[i].text).toBe('+foo')
    expect(lines[i].type).toBe(DiffLineType.Add)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBe(1)
    expect(lines[i].noTrailingNewLine).toBe(false)
    i++
  })

  it('parses diffs where neither file version has a trailing newline', () => {
    // echo -n 'foo' >  test
    // git add -A && git commit -m foo
    // echo -n 'bar' > test
    // git diff test
    const diffText = `diff --git a/test b/test
index 1910281..ba0e162 100644
--- a/test
+++ b/test
@@ -1 +1 @@
-foo
\\ No newline at end of file
+bar
\\ No newline at end of file
`
    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.hunks).toHaveLength(1)

    const hunk = diff.hunks[0]
    expect(hunk.unifiedDiffStart).toBe(0)
    expect(hunk.unifiedDiffEnd).toBe(2)

    const lines = hunk.lines
    expect(lines).toHaveLength(3)

    let i = 0
    expect(lines[i].text).toBe('@@ -1 +1 @@')
    expect(lines[i].type).toBe(DiffLineType.Hunk)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBeNull()
    expect(lines[i].noTrailingNewLine).toBe(false)
    i++

    expect(lines[i].text).toBe('-foo')
    expect(lines[i].type).toBe(DiffLineType.Delete)
    expect(lines[i].oldLineNumber).toBe(1)
    expect(lines[i].newLineNumber).toBeNull()
    expect(lines[i].noTrailingNewLine).toBe(true)
    i++

    expect(lines[i].text).toBe('+bar')
    expect(lines[i].type).toBe(DiffLineType.Add)
    expect(lines[i].oldLineNumber).toBeNull()
    expect(lines[i].newLineNumber).toBe(1)
    expect(lines[i].noTrailingNewLine).toBe(true)
    i++
  })

  it('parses binary diffs', () => {
    const diffText = `diff --git a/IMG_2306.CR2 b/IMG_2306.CR2
new file mode 100644
index 0000000..4bf3a64
Binary files /dev/null and b/IMG_2306.CR2 differ
`
    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.hunks).toHaveLength(0)
    expect(diff.isBinary).toBe(true)
  })

  it('parses diff of empty file', () => {
    // To produce this output, do
    // touch foo
    // git diff --no-index --patch-with-raw -z -- /dev/null foo
    const diffText = `new file mode 100644
index 0000000..e69de29
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.hunks).toHaveLength(0)
  })

  it('parses hunk headers with omitted line counts from new file', () => {
    const diffText = `diff --git a/testste b/testste
new file mode 100644
index 0000000..f13588b
--- /dev/null
+++ b/testste
@@ -0,0 +1 @@
+asdfasdf
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.hunks).toHaveLength(1)

    const hunk = diff.hunks[0]
    expect(hunk.header.oldStartLine).toBe(0)
    expect(hunk.header.oldLineCount).toBe(0)
    expect(hunk.header.newStartLine).toBe(1)
    expect(hunk.header.newLineCount).toBe(1)
  })

  it('parses hunk headers with omitted line counts from old file', () => {
    const diffText = `diff --git a/testste b/testste
new file mode 100644
index 0000000..f13588b
--- /dev/null
+++ b/testste
@@ -1 +0,0 @@
-asdfasdf
`

    const parser = new DiffParser()
    const diff = parser.parse(diffText)
    expect(diff.hunks).toHaveLength(1)

    const hunk = diff.hunks[0]
    expect(hunk.header.oldStartLine).toBe(1)
    expect(hunk.header.oldLineCount).toBe(1)
    expect(hunk.header.newStartLine).toBe(0)
    expect(hunk.header.newLineCount).toBe(0)
  })
})
