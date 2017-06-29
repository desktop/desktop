'use strict'

const prettier = require('prettier');
const glob = require('glob');
const fs = require('fs');
const globPattern = 'app/{src, test}/**/*.{ts, tsx}'
const prettierOptions = {
  "parser": "typescript",
  "singleQuote": true,
  "trailingComma": "es5",
  "semi": false,
  "printWidth": 80
}

glob(globPattern, (err, matches) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const uglyFiles = [];
  const matchCount = matches.length;

  for (const match of matches) {
    const fileContents = fs.readFileSync(match, 'utf8');
    const isPretty = prettier.check(fileContents, prettierOptions);

    if (!isPretty) {
      uglyFiles.push(match);
    }
  }

  if (uglyFiles.length === 0) {
    console.log("This is some pretty code");
  } else {
    console.log(`${uglyFiles.length} out of ${matchCount} code files are ugly. Please run 'npm run prettify' to make the following files pretty:`);

    for (const file of uglyFiles) {
      console.log(`\t${file}`);
    }

    process.exit(1);
  }
});
