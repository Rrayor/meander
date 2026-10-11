Feature: Database file switching
  The active database pool must only swap to a compatible Meander database.

  Scenario: switching to a compatible database swaps the active pool
    Given an application state on a temporary seeded database
    And a compatible seeded database as the candidate
    When the application switches to the candidate
    Then the switch succeeds
    And the active pool reads from the candidate database

  Scenario: a file that is not a SQLite database is rejected
    Given an application state on a temporary seeded database
    And a file that is not a SQLite database as the candidate
    When the application switches to the candidate
    Then the switch fails
    And the active pool still reads from the original database

  Scenario: a SQLite database without Meander metadata is rejected
    Given an application state on a temporary seeded database
    And a SQLite database without Meander metadata as the candidate
    When the application switches to the candidate
    Then the switch fails
    And the active pool still reads from the original database
