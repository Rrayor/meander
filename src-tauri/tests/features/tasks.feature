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
