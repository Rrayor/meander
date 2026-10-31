Feature: Tasks
  Tasks belong to a profile; the backlog lists only the active profile's
  tasks.

  Scenario: a fresh profile has an empty task list
    Given an application state on a temporary seeded database
    Then the task list is empty

  Scenario: tasks are scoped to their owning profile
    Given an application state on a temporary seeded database
    And a task exists on a second profile
    Then the task list is empty
    And the second profile's task list has one task

  Scenario: creating a task trims and stores it on the active profile
    Given an application state on a temporary seeded database
    When I create a task with surrounding whitespace
    Then the task creation succeeds
    And a task titled Plan the week exists in the backlog
    And the task belongs to the default profile

  Scenario: blank task titles are rejected
    Given an application state on a temporary seeded database
    When I create a task with a blank title
    Then the task creation fails
    And the task list is empty

  Scenario: the backlog keeps its manual order
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a backlog task titled Beta
    When I move Beta before Alpha
    Then the reorder succeeds
    And the task list order is "Beta, Alpha"

  Scenario: reordering with a foreign task id is rejected
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a task exists on a second profile
    When I move a task before the foreign task
    Then the reorder fails

  Scenario: estimates must be a positive value
    Given an application state on a temporary seeded database
    When I create a task with an estimate of 0 minutes
    Then the task creation fails
    And the task list is empty

  Scenario: estimates must not exceed 24 hours
    Given an application state on a temporary seeded database
    When I create a task with an estimate of 1441 minutes
    Then the task creation fails
    And the task list is empty

  Scenario: descriptions are limited to 20,000 characters
    Given an application state on a temporary seeded database
    When I create a task with an oversized description
    Then the task creation fails
    And the task list is empty

  Scenario: a title at the 200-character limit is accepted
    Given an application state on a temporary seeded database
    When I create a task with a title of 200 characters
    Then the task creation succeeds
    And the task list has 1 task

  Scenario: a title one character over the limit is rejected
    Given an application state on a temporary seeded database
    When I create a task with a title of 201 characters
    Then the task creation fails
    And the task list is empty

  Scenario: control characters in titles are rejected
    Given an application state on a temporary seeded database
    When I create a task with a control character in the title
    Then the task creation fails
    And the task list is empty

  Scenario: unicode titles are accepted
    Given an application state on a temporary seeded database
    When I create a task titled "Café ☕ plan — wöchentlich"
    Then the task creation succeeds
    And a task titled "Café ☕ plan — wöchentlich" exists in the backlog

  Scenario: a one-minute estimate is accepted
    Given an application state on a temporary seeded database
    When I create a task with an estimate of 1 minutes
    Then the task creation succeeds
    And the task list has 1 task

  Scenario: an estimate at exactly 24 hours is accepted
    Given an application state on a temporary seeded database
    When I create a task with an estimate of 1440 minutes
    Then the task creation succeeds
    And the task list has 1 task

  Scenario: negative estimates are rejected
    Given an application state on a temporary seeded database
    When I create a task with an estimate of -1 minutes
    Then the task creation fails
    And the task list is empty

  Scenario: a description at the 20,000-character limit is accepted
    Given an application state on a temporary seeded database
    When I create a task with a description of 20000 characters
    Then the task creation succeeds
    And the task has a description of 20000 characters

  Scenario: a whitespace-only description is stored as none
    Given an application state on a temporary seeded database
    When I create a task with a whitespace description
    Then the task creation succeeds
    And the task has no description

  Scenario: a carry-over rule is stored on creation
    Given an application state on a temporary seeded database
    When I create a task with carry-over rule carry
    Then the task creation succeeds
    And the task has carry-over rule carry

  Scenario: tasks default to asking at the week boundary
    Given an application state on a temporary seeded database
    When I create a task titled "Undecided"
    Then the task creation succeeds
    And the task has no carry-over rule

  Scenario: moving a task to the end of the backlog
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a backlog task titled Beta
    And a backlog task titled Gamma
    When I move Alpha after Gamma
    Then the reorder succeeds
    And the task list order is "Beta, Gamma, Alpha"

  Scenario: moving a task into the middle of the backlog
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a backlog task titled Beta
    And a backlog task titled Gamma
    When I move Gamma before Beta
    Then the reorder succeeds
    And the task list order is "Alpha, Gamma, Beta"

  Scenario: new tasks are appended after existing ones
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I create a task titled "Beta"
    Then the task creation succeeds
    And the task list order is "Alpha, Beta"

  Scenario: deleting a backlog task removes it
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a backlog task titled Beta
    When I delete Alpha
    Then the deletion succeeds
    And the task list order is "Beta"

  Scenario: deleting another profile's task is rejected
    Given an application state on a temporary seeded database
    And a task exists on a second profile
    When I delete the foreign task
    Then the deletion fails
    And the second profile's task list has one task

  Scenario: deleting an unknown task is rejected
    Given an application state on a temporary seeded database
    When I delete a task that does not exist
    Then the deletion fails

  Scenario: editing a task persists the new values
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I rename Alpha to "Gamma" and mark it done
    Then the task update succeeds
    And the task list order is "Gamma"
    And the task "Gamma" has status done
    And the task's updated timestamp changed

  Scenario: updating another profile's task is rejected
    Given an application state on a temporary seeded database
    And a task exists on a second profile
    When I update the foreign task
    Then the task update fails
    And the second profile's task list has one task

  Scenario: updating an unknown task is rejected
    Given an application state on a temporary seeded database
    When I update a task that does not exist
    Then the task update fails

  Scenario: spent time beyond the duration limit is rejected on update
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I update Alpha with a spent time of 1441 minutes
    Then the task update fails

  Scenario: a backlog task joins the weekly backlog
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I add the task Alpha to the current week
    Then the task Alpha is in the weekly backlog

  Scenario: a weekly backlog task returns to the backlog
    Given an application state on a temporary seeded database
    And a weekly backlog task titled Alpha
    When I return the task Alpha to the backlog
    Then the task Alpha is in the backlog

  Scenario: a scheduled task returns to the backlog clearing its date
    Given an application state on a temporary seeded database
    And a task titled Alpha scheduled for today
    When I return the task Alpha to the backlog
    Then the task Alpha is in the backlog
    And the task Alpha has no scheduled date

  Scenario: adding an already-weekly task is rejected
    Given an application state on a temporary seeded database
    And a weekly backlog task titled Alpha
    When I add the task Alpha to the current week
    Then the week move fails

  Scenario: returning an already-backlogged task is rejected
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I return the task Alpha to the backlog
    Then the backlog return fails
