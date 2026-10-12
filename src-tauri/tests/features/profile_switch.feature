Feature: Profile switching
  Profiles can be switched at runtime; the active profile is a selection,
  not data, and unknown profiles are rejected.

  Scenario: switching to an existing profile updates the active profile
    Given an application state on a temporary seeded database
    And a second profile exists
    When the application switches to the second profile
    Then the switch succeeds
    And the active profile is the second profile

  Scenario: switching to an unknown profile is rejected
    Given an application state on a temporary seeded database
    When the application switches to an unknown profile
    Then the switch fails
    And the active profile is unchanged
