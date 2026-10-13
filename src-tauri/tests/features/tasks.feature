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
