### Desktop Quality
This document is a general outline of Quality Engineering practices for Desktop, both for scheduled and ad-hoc testing. The manual test cases used to test Desktop in both Mac and Windows can be found [here](https://github.com/desktop/desktop/blob/development/docs/process/testing.md). 

#### Test Cases
The test cases are relevant to the latest build of Desktop, and the manifest is broken down into sections that include installation, setup, adding repositories, general use, and OS-specific cases, among others. As the manifest is a living document, it may sometimes include future features as Quality needs to stay slightly ahead of the roadmap.

#### Testing Desktop
Desktop currently releases new builds on a non-scheduled cadence, with both beta and production versions available to Quality to testing. For each build, Quality executes all or a sub-section of the manifest, along with exploratory testing. 

In addition, all new features result in new or updated test cases, which are eventually added to the manifest. When a bug or concern is found, Quality files an Issue and the discussion with the core team and the open-source community begins. 

#### Contributing or need more info
As Desktop is an open-source project, any outside feedback is welcomed. Feel free to open a Pull Request or Issue (label:bug) to contribute, or you can start a conversation by creating a general Issue. 
