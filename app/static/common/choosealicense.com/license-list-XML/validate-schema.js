#!/usr/bin/env node
/**
 * Node.js for validating SPDX license XML files.
 * SPDX-License-Identifier: CC0-1.0
 */

var xsd = require('libxml-xsd');
var glob = require('glob');
var fs = require('fs');

/**
 * Validates a files against the XSD
 * @param file
 * @returns Error if any error occurs, otherwise returns null
 */
function validate(schema, file) {
	var documentString = fs.readFileSync(file, 'utf8');
	try {
		var validationErrors = schema.validate(documentString);
	} catch(error) {
		return new Error('File ' + file + ': ' + error);
	}
	if (validationErrors) {
		var errormsg = null;
		validationErrors.forEach(function(error) {
			if (errormsg) {
				errormsg += ';';
				errormsg += ' at line ' + error.line + ' ' + error.message;
			} else {
				errormsg = ' at line ' + error.line + ' ' + error.message;
			}
		});
		return new Error("File "+file+" "+errormsg);
	} else {
		return null;	// no errors
	}
}

function main() {
	var srcDir = 'src';
	var xsdLocation = 'schema/ListedLicense.xsd';
	var schemaString = fs.readFileSync(xsdLocation, 'utf8');
	var schema = xsd.parse(schemaString);
	var files = process.argv.filter(function(arg) {
		return arg.endsWith('.xml');
	});
	if (files.length == 0) {
		files = glob.sync('./' + srcDir + '/**/*.xml');
	}
	var error = null;
	var pass = 0, fail = 0;
	files.forEach(function(file) {
		var fileError = validate(schema, file);
		if (fileError) {
			fail++;
			if (!error) {
				error = fileError;
			} else {
				// append the file in error
				error = new Error(error.message+fileError.message);
			}
		} else {
			pass++;
		}
	});
	console.log('validation complete ' + pass + ' passed, ' + fail + ' failed');
	if (error) {
		console.error(error.message);
		process.exit(1);
	}
}

main();
