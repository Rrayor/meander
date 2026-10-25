Feature: Weekly kanban board
  The board lists one week's tasks: the standing weekly backlog plus
  everything scheduled inside the week bounds derived from the
  profile's week-start setting. Reading a week materializes that
  week's series occurrences.

  Scenario: the board lists weekly backlog and scheduled tasks for the week
    Given an application state on a temporary seeded database
    And a weekly backlog task titled Errand
    And a task titled Chore scheduled for "2026-10-21"
    And a task titled Later scheduled for "2026-11-04"
    When I view the board for the week containing "2026-10-21"
    Then the board lists 2 tasks
    And the board lists Chore on "2026-10-21"
    And the board does not list Later

  Scenario: viewing the board materializes series occurrences
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    And I view the board for the week containing "2026-10-26"
    Then the board lists 1 task
    And the board lists Standup on "2026-10-26"

  Scenario: a deleted instance stays off the board
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    And I view the board for the week containing "2026-10-26"
    And I delete the "2026-10-26" instance of Standup
    And I view the board for the week containing "2026-10-26"
    Then the board does not list Standup on "2026-10-26"

  Scenario: the board respects the profile's week start
    Given an application state on a temporary seeded database
    And a task titled Chore scheduled for "2026-10-20"
    When I set the active profile's week start to Wednesday
    And I view the board for the week containing "2026-10-25"
    Then the board lists 0 tasks
    When I view the board for the week containing "2026-10-20"
    Then the board lists 1 task

  Scenario: a malformed date fails the board read
    Given an application state on a temporary seeded database
    When I view the board for the week containing "not-a-date"
    Then the board read fails

  Scenario: the board never lists another profile's tasks
    Given an application state on a temporary seeded database
    And a task scheduled for "2026-10-21" exists on a second profile
    When I view the board for the week containing "2026-10-21"
    Then the board lists 0 tasks

  Scenario: the demo seed fills past weeks the board can read
    Given an application state on a temporary seeded database
    When I run the demo seed
    And I view the board for the week 8 weeks ago
    Then the board is not empty

  Scenario: the demo seed is a one-shot
    Given an application state on a temporary seeded database
    When I run the demo seed
    And I run the demo seed
    Then the demo seed inserted no rows
