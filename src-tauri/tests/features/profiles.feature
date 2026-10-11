Feature: Profiles
  A seeded database always contains the default profile so the app has
  exactly one active profile from first run.

  Scenario: a seeded database contains the default profile
    Given a temporary database path
    When I connect the persistence layer
    And I seed the database
    Then the profile list contains exactly the default profile
    And the default profile has audit timestamps
