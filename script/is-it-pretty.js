'use strict'

const prettier = require('prettier');
const glob = require('glob');

glob("app/**/*.{ts, tsx}", (err, matches) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  let allGood = true;
  let uglyFiles = 0;
  const matchCount = matches.length;

  for (const match of matches) {
    const isPretty = prettier
      .check(match, {
        "singleQuote": true,
        "trailingComma": "es5",
        "tabWidth": 2,
        "semi": false,
        "printWidth": 100
      });

      console.log(`Checking ${match} for prettiness.`);

      if (!isPretty) {
        allGood = false;
        uglyFiles++;
      }
  }

  if (allGood) {
    console.log("This is some pretty code");
  } else {
    console.error(`${uglyFiles} out of ${matchCount} code files are not pretty. Please run "prettifier" on commited files.`);
    process.exit(1);
  }
})
