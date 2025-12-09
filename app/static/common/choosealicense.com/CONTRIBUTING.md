# How to contribute

We love Pull Requests! Your contributions help make ChooseALicense.com great.

Contributions to this project are [released](https://help.github.com/articles/github-terms-of-service/#6-contributions-under-repository-license) to the public under the [project's open source license](LICENSE.md).

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## Getting started

So you want to contribute to ChooseALicense. Great! We welcome any help we can
get. But first, please make sure you understand what
[this site is all about](https://choosealicense.com/about). It’s not a comprehensive list of all possible licenses.

## Adding a license

Choosealicense.com is intended to demystify license choices, not present or catalog all of them. As such, only a small number are highlighted on the home page or <https://choosealicense.com/licenses>, and there are several requirements for a license to be [cataloged](https://choosealicense.com/appendix/) on the site:

1. The license must have [an SPDX identifier](https://spdx.org/licenses/). If your license isn't registered with SPDX, please [request that it be added](https://github.com/spdx/license-list-XML/blob/main/CONTRIBUTING.md).
2. The license must be listed on one of the following approved lists of licenses:
   * [List of OSI approved licenses](https://opensource.org/licenses/alphabetical)
   * [GNU's list of free licenses](https://www.gnu.org/licenses/license-list.en.html) (*note: the license must be listed in one of the three "free" categories*)
   * [Open Definition's list of conformant licenses](https://opendefinition.org/licenses/) (non-code)
3. The license must be used in at least *1,000* public repositories. This may be documented, for example, with a [GitHub code search](https://github.com/search?q=MIT+path%3ALICENSE&type=Code).
4. 3 notable projects using the license must be identified. These must have straightforward LICENSE files which serve as examples newcomers can follow and that could be detected by [licensee](https://github.com/licensee/licensee) if it knew about the license.

If your proposed license meets the above criteria, here's a few other things to keep in mind as you propose the license's addition:

* Is the license already cataloged? See <https://choosealicense.com/appendix/> for a list of all of the licenses known by the site.
* Licenses live in the `/_licenses` folder.
* The license files should be in the format of `_licenses/[lowercased-spdx-id].txt` (e.g., `_licenses/mit.txt`)
* Each license has both [required and optional metadata](https://github.com/github/choosealicense.com#license-metadata) that should be included.
* The text of the license should be wrapped to a 78 character width.
* The text of the license should match the corresponding text found in [spdx/license-list-data](https://github.com/spdx/license-list-data/blob/master/text/). If there are errors there, please fix them in [spdx/license-list-XML](https://github.com/spdx/license-list-XML) (from which the plain text version is generated) so as to minimize license text variation and make it easier for choosealicense.com to eventually consume license texts directly from SPDX.
* The body of the file should be the text of the license in plain text.

## Making changes

The easiest way to make a change is to simply edit a file from your browser.
When you click the edit button, it will fork the repository under your account.
Note what issue/issues your patch fixes in the commit message.

For example, to [change this file](/CONTRIBUTING.md),
find it in the GitHub repository. Then click the `Edit` button. Make your
changes, type in a commit message, and click the `Propose File Change` button.
That’s it!

For more advanced changes, check out [the bootstrap instructions](https://github.com/github/choosealicense.com#run-it-on-your-machine) in the [project's readme](/README.md).

## Testing

[HTML::Proofer](https://github.com/gjtorikian/html-proofer) is set up to validate all links within the project. You can run this locally to ensure that your changes are valid:

```shell
./script/bootstrap
./script/cibuild
```
