'use strict'

const prettier = require('prettier');
const glob = require('glob');
const fs = require('fs');

glob("app/{src, test}/**/*.{ts, tsx}", (err, matches) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const uglyFiles = [];
  const matchCount = matches.length;

  for (const match of matches) {
    const fileContents = fs.readFileSync(match, 'utf8');
    const isPretty = prettier
      .check(fileContents, {
        "parser": "typescript",
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
    console.log(`${uglyFiles.length} out of ${matchCount} code files are ugly. Please prettify the following files:`);

    for (const file of uglyFiles) {
      console.log(`\t${file}`);
    }

    process.exit(1);
  }
})
