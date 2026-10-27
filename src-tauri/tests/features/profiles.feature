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

  Scenario: the global threshold persists, clears, and validates
    Given an application state on a temporary seeded database
    Then the active profile has no global threshold
    When I set the active profile's global threshold to 480 minutes
    Then the active profile's global threshold is 480 minutes
    # §297: minutes saved without a pick get the default red.
    And the active profile's global threshold color is the default red
    When I clear the active profile's global threshold
    Then the active profile has no global threshold
    When I set the active profile's global threshold to 0 minutes
    Then the threshold save fails
    When I set the active profile's global threshold to 1441 minutes
    Then the threshold save fails
    # Boundaries: the full 1–1440 range is valid.
    When I set the active profile's global threshold to 1 minutes
    Then the active profile's global threshold is 1 minutes
    When I set the active profile's global threshold to 1440 minutes
    Then the active profile's global threshold is 1440 minutes

  Scenario: the global threshold keeps a custom color and is per-profile
    Given an application state on a temporary seeded database
    When I set the active profile's global threshold to 300 minutes with color #60a5fa
    Then the active profile's global threshold is 300 minutes
    And the active profile's global threshold color is #60a5fa
    Given a second profile exists
    When the application switches to the second profile
    Then the active profile has no global threshold
    When I set the active profile's global threshold to 60 minutes
    Then the active profile's global threshold is 60 minutes
    And the active profile's global threshold color is the default red

  Scenario: the week start is a per-profile display setting
    Given an application state on a temporary seeded database
    Then the active profile's week start is Monday
    When I set the active profile's week start to Sunday
    Then the active profile's week start is Sunday
    Given a second profile exists
    When the application switches to the second profile
    Then the active profile's week start is Monday
    When I set the active profile's week start to Wednesday
    Then the active profile's week start is Wednesday
    When the application switches back to the original profile
    Then the active profile's week start is Sunday

  Scenario: work days are a per-profile scheduling setting
    Given an application state on a temporary seeded database
    Then the active profile's work days are the default set
    When I set the active profile's work days to the weekend
    Then the active profile's work days are the weekend
    Given a second profile exists
    When the application switches to the second profile
    Then the active profile's work days are the default set
    When the application switches back to the original profile
    Then the active profile's work days are the weekend

  Scenario: clearing all work days is rejected
    Given an application state on a temporary seeded database
    When I clear the active profile's work days
    Then the update fails
    And the active profile's work days are the default set

  Scenario: a single work day is allowed
    Given an application state on a temporary seeded database
    When I set the active profile's work days to Monday only
    Then the active profile's work days are Monday only

  Scenario: per-weekday threshold overrides persist independently
    Given an application state on a temporary seeded database
    When I set the active profile's threshold for monday to 480 minutes
    Then the active profile's threshold for monday is 480 minutes
    And the active profile has no threshold for tuesday
    When I set the active profile's threshold for sunday to 720 minutes
    Then the active profile's threshold for sunday is 720 minutes
    And the active profile's threshold for monday is 480 minutes
    When I set the active profile's threshold for monday to 0 minutes
    Then the threshold save fails
