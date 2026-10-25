Feature: Weekly kanban board
  The board lists one week's tasks: the standing weekly backlog plus
  everything scheduled inside the week bounds derived from the
  profile's week-start setting. Reading a week materializes that
  week's series occurrences.

  Scenario: the board lists weekly backlog and scheduled tasks for the week
    Given an application state on a temporary seeded database
    And a weekly backlog task titled Errand
    And a task titled Chore scheduled for today
    And a task titled Later scheduled 8 days from today
    When I view the board for the week 0 weeks ago
    Then the board lists 2 tasks
    And the board lists Chore on today
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

  Scenario: the weekly backlog is current-week state, never history
    Given an application state on a temporary seeded database
    And a weekly backlog task titled Pending
    When I view the board for the week 2 weeks ago
    Then the board lists 0 tasks

  Scenario: carry-over moves undecided past tasks on the current week's read
    Given an application state on a temporary seeded database
    And a task titled Carried scheduled 7 days ago with carry-over carry
    And a task titled Returned scheduled 7 days ago with carry-over return
    And a task titled Undecided scheduled 7 days ago with carry-over unset
    When I view the board for the week 0 weeks ago
    Then the board lists Carried in the weekly backlog
    And the board does not list Returned
    And the board does not list Undecided
    And Undecided is pending a carry-over decision
    When I resolve the carry-over for Undecided as carry
    And I view the board for the week 0 weeks ago
    Then the board lists Undecided in the weekly backlog

  Scenario: done tasks never prompt and a return lands in the backlog
    Given an application state on a temporary seeded database
    And a done task titled Finished scheduled 7 days ago
    And a task titled Undecided scheduled 7 days ago with carry-over unset
    When I view the board for the week 0 weeks ago
    Then Finished is not pending a carry-over decision
    When I resolve the carry-over for Undecided as return
    Then a task titled "Undecided" exists in the backlog

  Scenario: a future board shows only dated tasks, never the weekly backlog
    Given an application state on a temporary seeded database
    And a weekly backlog task titled Pending
    And a task titled Errand scheduled 14 days from today
    When I create a task titled "Standup" repeating weekly on Monday
    And I view the board for the week 2 weeks ahead
    Then the board lists 2 tasks
    And the board does not list Pending
