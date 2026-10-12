Feature: Profile renaming
  Profiles can be renamed; the new name is validated and the update
  timestamp reflects the change.

  Scenario: renaming a profile updates its name and timestamp
    Given an application state on a temporary seeded database
    When I rename the default profile to Personal
    Then the rename succeeds
    And the default profile is named Personal
    And the profile updated timestamp changed

  Scenario: renaming to a blank name is rejected
    Given an application state on a temporary seeded database
    When I rename the default profile to a blank name
    Then the rename fails
    And the default profile is still named Default

  Scenario: renaming an unknown profile is rejected
    Given an application state on a temporary seeded database
    When I rename an unknown profile
    Then the rename fails
    And the default profile is still named Default
