# Product-level scenarios for the short-lived OAuth credential preview.
# These describe intended user outcomes, not completed live-platform validation.
# Device-bound credentials, token sharing with gh, forced account migration,
# token export, and SSH changes are outside this feature.

Feature: Stay signed in to GitHub Desktop with short-lived credentials
  As a GitHub Desktop user
  I want my session to renew when possible
  So that I can keep working securely without repeatedly signing in

  Rule: Adopt short-lived credentials without disrupting existing users

    Scenario: Opt in new sign-ins
      When I sign in to GitHub Desktop
      Then Desktop requests credentials that can keep my session active
      And Desktop retains the permissions needed for my existing workflows

    Scenario: Keep existing accounts working
      Given I am signed in with an existing account
      When the short-lived credential support becomes available
      Then I can continue using that account without signing in again
      And Desktop does not switch that account to new credentials automatically

    Scenario: Sign in on a host without short-lived credential support
      Given my GitHub host does not provide renewable credentials
      When I sign in to Desktop
      Then I can continue using the existing sign-in experience

    Scenario: Sign in to GitHub Enterprise Server
      Given GitHub Enterprise Server does not yet support renewable credentials
      When I sign in to Desktop
      Then I can use the existing browser sign-in experience
      And Desktop does not request renewable credentials

    Scenario: Continue an active session when the preview is turned off
      Given I signed in with renewable credentials during the preview
      When the preview feature flag is turned off
      Then Desktop continues renewing my existing session
      And new sign-ins no longer opt in to the preview

    Scenario: Sign in to a supported GitHub Enterprise Cloud host
      Given my GitHub Enterprise Cloud host supports renewable credentials
      When I sign in to that host
      Then Desktop can keep my Enterprise session active
      And Desktop does not use credentials from another host

  Rule: Protect credentials throughout the session

    Scenario: Resume a renewable session after restarting Desktop
      Given I am signed in with renewable credentials
      When I restart Desktop
      Then I can continue working without signing in again
      And Desktop can still renew my session when needed

    Scenario: Keep renewal credentials private
      Given I am signed in with renewable credentials
      When Desktop authenticates GitHub features
      Then renewal credentials remain in secure storage

    Scenario: Avoid insecure storage if saving credentials fails
      Given Desktop cannot save my credentials securely
      When I attempt to sign in or my session needs renewal
      Then Desktop does not continue with unsaved credentials
      And Desktop does not store them in plaintext
      And I can try signing in again

  Rule: Renew active sessions without interrupting work

    Scenario: Continue working as my session approaches expiry
      Given I am signed in with renewable credentials
      When my session is about to expire
      Then Desktop renews it right before my next authenticated operation
      And I do not need to sign in again

    Scenario: Coordinate simultaneous requests for the same account
      Given several Desktop features need my account at the same time
      When my session needs renewal
      Then they use the same renewed session
      And none of them receives credentials invalidated by that renewal

    Scenario: Keep my account after a temporary renewal failure
      Given I am signed in with renewable credentials
      When a network or GitHub service issue prevents renewal
      Then Desktop tells me the current operation cannot continue
      And I remain signed in
      And Desktop can try renewal again later

    Scenario: Retry work as soon as a temporary outage ends
      Given a temporary issue prevented my session from renewing
      When I retry my work after the service recovers
      Then Desktop renews my session without making me wait
      And I can continue without signing in again

    Scenario: Require sign-in if my session cannot be renewed
      Given I am signed in with renewable credentials
      When GitHub rejects renewal or returns unusable credentials
      Then Desktop stops using the invalid session
      And Desktop signs me out and asks whether I want to sign in again

  Rule: Keep GitHub features using my current session

    Scenario Outline: Use the current session across Desktop features
      Given I am signed in with renewable credentials
      When I use <feature> after my session needs renewal
      Then Desktop uses my renewed session for that feature
      And I do not have to sign in again

      Examples:
        | feature             |
        | GitHub API requests |
        | Git operations      |
        | Git LFS operations  |
        | Copilot             |
        | private images      |

    Scenario: Preserve access to public information after sign-out
      Given my account has been signed out
      When Desktop requests public GitHub information without authentication
      Then that request can continue without my account credentials

    Scenario: Handle an operation started before renewal
      Given an operation used credentials that were replaced during renewal
      When GitHub rejects that operation
      Then Desktop keeps my renewed session
      And Desktop does not repeat the operation without my action

  Rule: Make reauthentication clear and recoverable

    Scenario: Explain why I need to sign in again
      Given my GitHub session cannot be renewed
      When Desktop shows the recovery prompt
      Then Desktop has signed me out
      And I can choose to sign in again
      And my local repositories and changes remain intact

    Scenario: Decline immediate sign-in after session expiry
      Given Desktop has signed me out and asked whether I want to sign in again
      When I choose "No"
      Then I remain signed out
      And I can use the normal sign-in option in account settings later

    Scenario: Return to work after reauthentication
      Given Desktop has signed me out and asked whether I want to sign in again
      When I choose "Yes" and complete sign-in
      Then Desktop signs me in to the same GitHub host
      And I can resume authenticated work

  Rule: Respect sign-out and account changes

    Scenario: Do not restore my account after sign-out
      Given renewal is in progress for my account
      When I sign out
      Then Desktop removes my account
      And a late renewal does not sign me back in
      And Desktop attempts to revoke credentials left unused by renewal

    Scenario: Revoke the session I actually signed out of
      Given my credentials change while I am signing out
      When Desktop completes sign-out
      Then Desktop attempts to revoke the credentials current at sign-out
      And it does not leave a renewed account signed in
