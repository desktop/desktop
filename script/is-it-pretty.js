'use strict'

const prettier = require('prettier');
const glob = require('glob');

glob("app/**/*.{ts, tsx}", (err, matches) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const uglyFiles = [];
  const matchCount = matches.length;

  for (const match of matches) {
    const isPretty = prettier
      .check(match, {
        "singleQuote": true,
        "trailingComma": "es5",
        "semi": false,
        "printWidth": 100
      });

      if (!isPretty) {
        uglyFiles.push(match);
      }
  }

  if (uglyFiles.length === 0) {
    console.log("This is some pretty code");
  } else {
    console.log(`${uglyFiles.length} out of ${matchCount} code files are not pretty. Please run "prettifier" on commited files.\n`);

    for (const file of uglyFiles) {
      console.log(`${file} is ugly`)
    }

    process.exit(1);
  }
})
