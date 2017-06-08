# Test Strategy and Approach for Desktop


## 1.0 Introduction
The Test Plan defines the test strategy and approach for the product shipped by the Desktop team. It includes the objectives, scope, schedule, risks and approach. This document will clearly identify what the test deliverables will be and what is deemed in and out of scope as we continue to build or enhance the features of GitHub Desktop.

### 1.1 Background
The GitHub Desktop team before now have shipped [GitHub Desktop for Windows](https://desktop.github.com/) and [GitHub Desktop for MAC](https://desktop.github.com/), going forward the team will be consolidating the two apps (Windows & MAC) into one, building a new GitHub Desktop app on electron. Building the new GHfD on electron guarantees compatibility in both Windows, MAC and Linux operating Systems. 

### 1.2 Objectives 
The GitHub Desktop project will allow teams to collaborate better using all/most of the features provided on github.com. 
This project will be sub-divided into features that will in-depth testing of the features and how they(features) relate and interact with other features.

Phase One of this feature release will be the alpha release, which will consist of, but not limited to exploratory and manual testing of the feature - with one - three iteration.
Phase Two/Beta of this feature release will focus on re-testing issues found in the alpha phase: sanity tests and regression testing.
Phase Three of the feature release will include continuous and more regression testing of the feature till we have a stable of the version of GitHub Desktop.

#### Features
- Login feature
- Clone feature
    - Drag and drop
- Create feature
- Publish feature
- Pull Request feature
    - Diff
- LFS
- and more

## 2.0 Scope
This section will consist of the scope of the GHfD project: What is in the scope of feature? and what's not.

## 3.0 Assumptions & Risks

### 3.1 Assumptions
This section will contain the documentations of all assumptions we are making while developing a particular feature and will be listed under each feature.

### 3.2 Risks
This section will consist of the likely risk that a feature might be introducing to the desktop and making sure that the team is aware of it when we develop

## 4.0 Test Approach 
This section of the documents will have details of how we approach testing as a team, considering the team's agile-scrum approach, with weekly iterations. Testing at the feature level allows us to have more in-depth knowledge of that feature, providing test cases that weren't thought of during development - exploratory testing.

### 4.1 Manual Testing
Manual tests will be performed on GHfD feature in all the phases. This will provide in-depth, understanding of the feature and hands-on approach. Exploratory testing will also be performed on the application. [See Full test manifest here]()


### 4.2 Test Automation
Automated test will be employed to increase the efficiency of testing GHfD; 
We currently are exploring:
- Integration Test using Spectron
- Acceptance or Functional Test - TBD
- UI Automation - TBD.

I and @bungdonuts will be exploring frameworks that can be utilized by the team. 

### 4.3 Test Environment
Tests will be executed on Windows and MAC. 
Are we limiting testing to the latest version of the operating systems of Windows and MAC?
Yes, unless scope changes.

### 4.4 Priorities

Issues that are found during testing are prioritized according to the severity of those bugs against the feature being built or extension.

P1 issues(bugs) during Alpha phase of the testing block shipping of Beta.
P2 issues(bugs) blocks the shipping of the feature.
P3 issues that do not block shipping - Enhancement of design


## 5.0         Milestones / Deliverables

- ### **5.1  Test Schedule**

This will be added to the test report, which indicates the time and effort spent on testing and see how we can efficiently run test at the optimal time as needed.

  The initial test schedule follows:

| Task Name | Start Date | Finish Date | Effort | Comments |
| --- | --- | --- | --- | --- |
| Test Planning | |  |  |  |
| Review Test documents |  |  |  |  |
| First deploy to QA environment (Alpha) |  |  |  |  |
| Functional testing - Iteration 1 |  |  |  |  |
| Functional testing - Iteration 2 |  |  |  |  |
| Functional testing - Iteration 3 |  |  |  |  |
| First deploy to QA environment (Beta) |  |  |  |  |
| Functional testing - Iteration 1 |  |  |  |  |
| Functional testing - Iteration 2 |  |  |  |  |
| Functional testing - Iteration 3 |  |  |  |  |

- ### **5.2   Deliverables:** 

Below are the deliverables after testing this feature

| Deliverables | For | Date/Milestone |
| --- | --- | --- |
| Test Plan | Desktop Team |  |
| Traceability Matrix | Desktop Team |  |
| Test Results | Desktop Team |  |
| Test Status report | Desktop Team |  |
| Metrics | All team members |  |