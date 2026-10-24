Feature: Profiles
  A seeded database always contains the default profile so the app has
  exactly one active profile from first run.

  Scenario: a seeded database contains the default profile
    Given a temporary database path
    When I connect the persistence layer
    And I seed the database
    Then the profile list contains exactly the default profile
    And the default profile has audit timestamps

  Scenario: creating a profile trims and stores it
    Given a temporary database path
    When I connect the persistence layer
    And I seed the database
    When I create a profile with surrounding whitespace
    Then the creation succeeds
    And a profile named Work exists in the list

  Scenario: blank profile names are rejected
    Given a temporary database path
    When I connect the persistence layer
    And I seed the database
    When I create a profile with a blank name
    Then the creation fails
    And the profile list contains only the default profile

  Scenario: over-long and control-character names are rejected
    Given a temporary database path
    When I connect the persistence layer
    And I seed the database
    When I create a profile with a 101-character name
    Then the creation fails
    When I create a profile with a newline in the name
    Then the creation fails
    And the profile list contains only the default profile

  Scenario: the week start is a per-profile display setting
    Given an application state on a temporary seeded database
    Then the active profile's week start is Monday
    When I set the active profile's week start to Sunday
    Then the active profile's week start is Sunday
    Given a second profile exists
    When the application switches to the second profile
    Then the active profile's week start is Monday
