# Release Planning

We plan work at two levels of granularity: first at the marketing release level (1.1, 1.2, etc.) and then at the milestone level. Marketing releases are made up of multiple milestones. Milestones should contain roughly a month’s worth of work.

We’ll release updates as needed or when a milestone is completed.

Large features and user-visible changes are feature-flagged, to be unflagged in the next marketing release. Beta and dev builds will have all feature flags enabled.

Below is the prototype release planner:

```md
# Major Features
* Description of the feature
* Description of the feature

## Checklists
**Legend**
* **HD** Help docs [repo](https://github.com/github/help-docs)
* **B** Blog [repo](https://github.com/github/help-docs)
* **GHD** Github Desktop [repo](https://github.com/desktop/desktop)
* **GHD-MS** Github Desktop marketing site [repo](https://github.com/github/desktop.github.com)
* **RT** Release tracker [repo](https://github.com/github/technology)
* **V** Video [repo](https://github.com/github/video)

### Get the ball rolling ✅ 
- [ ] **[RT]** Add release tracker card to project board in [github/technology](https://github.com/github/technology/projects) — [link to issue](#)
- [ ] **[GHD-MS]** Create issue in [github/desktop.github.com](https://github.com/github/desktop.github.com/) — [link to issue](#)
- [ ] **[HD]** Create issue to notify help docs to start content strategy in [help-docs](https://github.com/github/help-docs) — [link to issue](#)
- [ ] **[B]** Create issue in [github/blog](https://github.com/github/help-docs) — [link to issue](#)
- [ ] **[V]** Create issue in [github/video](https://github.com/github/video) if necessary — [link to issue](#)

### Execute
- [ ] **[HD]** Verify a PR has been opened — [link to PR](#)
- [ ] **[B]** Create blog post PR — [link to PR](#)
- [ ] **[GHD-MS]** Create marketing site PR — [link to PR](#)
- [ ] **[GHD]** Close out issues in previous milestone — [link to previous milestone](#)

### Review
- [ ] **[B]** Write draft for blog post
- [ ] **[HD]** Verify help docs are ready to be merged 
- [ ] **[V]** Verify gifs/videos are created and in the blog post
- [ ] **[QA]** Get QA sign-off (@desktop/qa)
- [ ] **[GHD]** Release to beta channel (include link to latest beta for **[HD]**, **[V]**, and **[QA]** teams)
- [ ] **[GHD]** Open new PR with feature flags set for production and move to stable — [link to PR](#)
- [ ] **[GHD]** Update the changelog — [link to PR](#)
- [ ] **[GHD-MS]** Put marketing site changes on staging

### Release
- [ ] **[GHD]** Merge PR (the one with feature flags) to `prod`
- [ ] **[GHD-MS]** Merge marketing site PR
- [ ] Release to Beta `1.1.1-beta1`
- [ ] **[B]** Merge and publish blog post PR
- [ ] **[HD]** Merge the help docs PR 
- [ ] **[RT]** Update the tracker card
- [ ] Monitor haystack closely for any new errors for the next hour
- [ ] Tweet about it
- [ ] celebrate 🎉
```
