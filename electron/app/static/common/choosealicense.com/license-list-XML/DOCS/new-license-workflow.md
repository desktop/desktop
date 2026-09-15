# New License Workflow

> ⚠️ **NOTA BENE:** A GitHub account is required for the New License Workflow. If you do not have a GitHub account yet, you must [create one](https://github.com/join) (for free) to continue with the workflow.

This document provides guidance and checklists for SPDX legal team members who are assigned to shepherd a new license request.

The instructions here assume the requestor has already submitted the new license/exception request via the [SPDX online tools](https://tools.spdx.org). Note that it is also possible for license requests to be submitted directly as Issues in the GitHub repo; when this occurs, they will not appear on the SPDX online tools page.

New license requests are to be assigned to an SPDX legal team member and that person is responsible for following the request through to its final determination.  Make sure to add yourself as the Assignee in the license request issue here on GitHub, add the [label](https://github.com/spdx/license-list-XML/labels) `new license/exception request`, and add the appropriate release milestone to the issue.

## Things to check for initial request:

1. Is the license or exception already on the SPDX License List?  Has it been submitted and rejected previously? (If yes, go to "If license not accepted")
2. Is the license or exception similar enough to an existing license or exception that additional markup could accomodate a match and there is no need to add the license?
    1. Use Alan’s diff tool to compare to existing licenses.
    2. If it’s a case that additional markup would create match, then may want to discuss with legal team to ensure markup is non-substantive or differences in text do not alter legal meaning (if so, this cuts towards adding a new license). For more on this see the [Matching Guidelines](https://spdx.org/spdx-license-list/matching-guidelines), guideline #2 in particular.
    3. If additional markup can accommodate the license, then the license does not need to be added: inform the requestor, comment on the issue as such, then create a PR for the existing license with the additional markup, and close issue once the PR has been merged.

2. If the submitter is not the license author or steward, ask for that contact or try to find that person or organization to make them aware the license has been submitted.
3. Check the submission for any other missing information, e.g., working URL, examples of use, full text, standard header, etc. See the Field definitions on [Overview page](https://spdx.dev/license-list/) for assistance.
Ask the submitter for any additional info needed, preferably via the Github issue, if possible. Record any updates there.
    1. The "standard header" or "official license header" is defined in the [SPDX Matching Guidelines (sec. 1.1.1)](https://spdx.dev/license-list/matching-guidelines/) as "specific text specified within the license itself to be put in the header of files."
4. Review the following, bring any questions to legal team:
    1. Is this an open source license?
    2. Is the short identifier unique? Does this license have a short identifier that is used elsewhere already (e.g., Fedora)?
    3. Does this license need markup for matching (omitable or replaceable text)?
    4. Record all notes in Issue
5. If the legal team determines that more information is needed, the information should be requested in the Issue, tagging the requester and/or steward(s) and add the [label](https://github.com/spdx/license-list-XML/labels) `new license/exception: waiting for submitter`. If a response is not received within a reasonable amount of time, a follow-up request should be sent. If a response is not received to either request the next release (or two, if close to a release at first correspondance), the Issue will be closed.

## If license not accepted:

If the license/exception has not been accepted (for whatever reason, including it is already represented on the license list), make a note in the issue as to why, add the [label](https://github.com/spdx/license-list-XML/labels) to `new license/exception: Not accepted`, inform the submitter, update the issue as needed, and close.

## If license is accepted:

If the license/exception is accepted, make a note in the issue, add the [label](https://github.com/spdx/license-list-XML/labels) `new license/exception: Accepted`. 

The final step is to create the license XML and test .txt files.

While you can do this using the [SPDX Online tools](https://spdxtools.sourceauditor.com/), you can also [clone (fork) the license-list-XML repository (repo)](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/about-forks), make the edits on your clone of the repo, then [send a pull request](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/creating-a-pull-request-from-a-fork). The clone-and-edit process is currently necessary for the test .txt file regardless, as the SPDX Online tools do not yet support adding a test .txt file (see issue [here](https://github.com/spdx/spdx-online-tools/issues/206)).

The following steps assume you're working from a clone of the repo, but we have some basic steps afterward if you'd like to edit the XML using the SPDX Online tools.

> ⚠️ **NOTA BENE:** All files rely on the `licenseId` (short identifier) for the license. The XML and test .txt files must be named identically using that `licenseId` value. For instance, if you're adding the _K-9 Robotic Dog Hardware License_ with a `licenseId` of _K-9RDHL_, you will have an XML file named `K-9RDHL.xml` and a test .txt file named `K-9RDHL.txt`.

### Add the test .txt file

1. The test files are in the `test/simpleTestForGenerator/` directory of your clone of the license-list-XML repo.
1. Locate the canonical text for the license. There should be a link to this in the issue, but if there isn't please ask for it from the license steward. Don't proceed until you have confirmed that you have the canonical text.
1. Copy the text of the license and add it to an appropriately named .txt file (see above for naming guidelines). This must be UTF-8 encoded. Special characters such as smart quotes should be avoided. Do try to keep formatting elements such as section indentation, _using spaces to make the indentation rather than using tabs_. For example, here's one of many indented sections in the [CC-BY-NC-ND-3.0-IGO.txt file](../test/simpleTestForGenerator/CC-BY-NC-ND-3.0-IGO.txt):
```
8. Miscellaneous

    a. Each time You Distribute or Publicly Perform the Work or a Collection, the Licensor offers to the recipient a license to the Work on the same terms and conditions as the license granted to You under this License.
```
4. Save the file and [commit it](https://docs.github.com/en/github/committing-changes-to-your-project) to your clone of the repository.

That's it! The test .txt file is now ready to go and you can move on to the XML file. It's slightly trickier than the test .txt file, but not much (at least not in the basic case that we cover here).

### Add the XML file

1. The license XML files are in the `src` directory. If the license you're working on does not yet have an XML file there, find the XML file for a similar license then copy it to be the basis of the new license XML file. For instance, for the _K-9 Robotic Dog Hardware License_ (henceforth referred to by its licenseId), you could copy the _CERN Open Hardware License v1.1_ file, `CERN-OHL-1.1.xml` to `K-9RDHL.xml`, then go from there.
1. Set the attributes in the `license` tag:
    * licenseId: Set to the licenseId for that license. This must match the licenseId used for to name both the XML and test .txt files.
    * name: The canonical name of the license. This must match the name of the license in the test .txt file. The value set in this attribute is what will appear in the [SPDX License List](https://spdx.org/licenses/).
    * isOsiApproved: Set to `true` if the license has been [approved by the Open Source Initiative](https://opensource.org/licenses) and `false` else.
    * listVersionAdded: Set to the [SPDX License List Version](https://github.com/spdx/license-list-XML/milestones) in which this license is being added. This version is set in the Milestone assigned to the issue.
    * If you copied the XML file of another license, remove any attributes used for that license but not needed for this new one. 
1. Set the value of the `crossRef` tag to the URL for the canonical version of the license. 
    * This should be the same as the URL used for the text added to the test .txt file above.
    * If the XML file you copied includes any additional `crossRef` tags, make sure you remove them.
1. Optionally, include a `notes` tag with any miscellaneous notes that would be relevant to users of the license.
    * `notes` is typically used to explain things like why a license has an entry on the list separate from another identical or nearly-identical license.
    * License interpretation comments should generally _not_ be included in a `notes` tag.
1. Add the text of the license in the `text` tag. There are several special things to pay attention to here:
    * The text must be the same text used in the test .txt file above. This is why it makes sense to do the test .txt file before the XML: it makes it easy to cut/paste the correct text into the XML file.
    * The title of the license should be wrapped in `<titleText></titleText>` tags. The value here should match the value in the `name` attribute in the `license` tag above.
    * Every paragraph should be wrapped in `<p></p>` tags, including the text in the `<titleText>` tag. Text in list tags (see below) do not need to be wrapped in `<p>` tags.
    * Lists—either ordered (numbered/lettered) or unordered (bullets)—must be formatted with `list`, `item`, and `bullet` tags. Lists can be nested. It's much easier to show this than explain it, so here's a basic example (see also [CC-BY-NC-ND-3.0-IGO](../src/CC-BY-NC-ND-3.0-IGO.xml) for a real world example):
```
<list>
    <item>
        <bullet>1.</bullet> text 1
    </item>
    <item>
        <bullet>2.</bullet> text 2
        <list>
            <item>
                <bullet>*</bullet> text *
            </item>
            <item>
                <bullet>-</bullet> text -
            </item>
        </list>
    </item>
    <item>
        <bullet>3.</bullet> text 3
        <list>
            <item>
                <bullet>a.</bullet> text a
            </item>
            <item>
                <bullet>b.</bullet> text b
                <list>
                    <item>
                        <bullet>i.</bullet> text i
                    </item>
                    <item>
                        <bullet>ii.</bullet> text ii
                    </item>
                </list>
            </item>
        </list>
    </item>
</list>
```
6. Save the file and [commit it](https://docs.github.com/en/github/committing-changes-to-your-project) to your clone of the repository.

You're done! Yes, there may be more advanced cases where more work than this is required. If you don't add licenses often, it's unlikely the core team will have assigned you something like that, but if they did or you have any questions at all, please ask! They love to help!

### Test locally

When you send the pull request (below), our [CI/CD](https://en.wikipedia.org/wiki/CI/CD) tool [Travis](https://travis-ci.org/github/spdx/license-list-XML) will run all of the tests to make sure everything is OK.

However, that can take quite a bit of time since it runs the tests for every single license in the list. If you make a mistake, you may be waiting a while to learn about it. Often it's much faster to test things locally first. There are three ways to do this:

#### Use your browser to test the XML file

Most web browsers "speak" XML, which means they're a quick and easy way to tell whether you have valid XML in your file. If you've messed something up (forgotten a closing tag, for instance), the browser will give you an error. If everything is A-OK, the browser will show you your XML file.

To test this, either point your browser at the XML file in your file system using [`file://`](https://en.wikipedia.org/wiki/File_URI_scheme) or drag/drop the XML file onto your browser window.

Of course, keep in mind that this only tests that the XML file is valid XML. The next tests below can be used to check whether the XML file correctly matches to the test text file.

#### Run all tests on your machine

You can run the same tests Travis will, just on your local machine so it's a little faster than waiting for the Travis return trip.

This requires that you're familiar with the command line and ensuring that script dependencies are all installed. Learning these things is left as an exercise for the reader.

1. Change to the directory where you've cloned the `license-list-XML` repo
1. Run `make validate-canonical-match`
1. Go make a cup of tea or something ☕️, because this will take a few minutes to complete

#### Test just the one license you added

If you don't feel like a cup of tea right now, you can run the `make validate-canonical-match` process against a single file instead of the entire corpus of licenses:

1. Change to the directory where you've cloned the `license-list-XML` repo
1. Run `./test-one-license licenseId`, replacing (of course) the `licenseId` with (naturally) the licenseId of the license in question 
1. Don't make that cup of tea, since you won't have time

### Send the pull request (PR) for the XML and .txt files

You're nearly done! All that's left is for you to tell the team you're done and the work is ready for review and merging.

To do that, [send a pull request](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/creating-a-pull-request-from-a-fork) (commonly known as a PR) to the project.

If you've never sent a PR before, or if you hit any problems, please let us know! We'll help you with the process so you can successfully contribute to the license list.

If the PR will take care of the issue's request, then in the PR description (not the PR title or comments, and not the commit message) you should include a line that says `Fixes #`, with the issue number immediately following the hash sign. That way, when the PR is merged, GitHub will automatically close the issue as well.

After you send your PR, the team will have a look and provide feedback. It might be that more changes are needed. If that's the case, simply make the changes in your clone of the repo and then commit them. Your PR will automatically update with the changes, so you won't have to do anything special.

Once everything looks good, the team will merge your PR into the main list.

🍾 Voila! 🍾 You've just landed a patch in an open source project. Congratulations!

### Editing the XML file using the SPDX Online tools

The [SPDX Online tools](https://tools.spdx.org/) are an option for editing the XML file but currently the tools can't help you add a test .txt file. Hopefully we'll be able to add that functionality in the future, but for now we recommend you use the "clone and edit" option detailed above when adding a new license. However, should you choose to try the online tools, here are some instructions:

1. Go to SPDX Online tools and to [License Requests](https://tools.spdx.org/app/license_requests/); click on your license and “edit XML”. Review XML file - make sure to include or check:
    1. The current XML output does not implement some of XML tagging and may mark every new line with a paragraph tag depending on input. If this has happened, it may be more efficient to re-submit the license text, using a wrapped text version.
    1. Make sure to include listVersionAdded= and the correct license list version number for the upcoming release
    1. Check for a standard license header
    1. Check if there should be any Notes based on Notes field descripiton in the [Overview page](https://spdx.dev/license-list/)
    1. Check that we have a working URL for the license text in the wild. If using a link in GitHub, include a link to a specific commit
    1. Check all the XML formatting: the current XML output does not insert the bullet or list tags. Use a previously submitted license as reference for how to format
    1. If you have questions about text that could be optional or could be replaceable, add a comment to the PR, once made or add a reviewer to check it
2. Before submitting the PR, you may want to run the test suite locally to catch any errors when comparing the XML against the test .txt file. Typically you can do this by running “make validate-canonical-match” from your checked-out copy of the license-list-XML repo.
3. Once the XML is done, “submit changes” in the tool, which will create a new PR in the repo. Tag the PR to be reviewed by at least one other member of the legal team before merging.
4. Once the PR is created in the repo, add a .txt file for the license in the test/simpleTestForGenerator directory
4. Check to see if the PR passes the automated test suite on check-in.  If it does not pass, evaluate the cause and resolve it.  If you need assistance, contact one of the technical leads (@goneall or @zvr) for assistance.
4. Once review has been completed and there are no further question, merge PR, and close issue.
