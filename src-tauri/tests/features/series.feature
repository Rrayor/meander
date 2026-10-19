Feature: Task series
  A repetition schedule on task creation or editing creates a task
  series; the task stays an ordinary instance linked to it.

  Scenario: creating a task with a schedule creates a linked series
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    Then the task creation succeeds
    And the series list has 1 series
    And the task is linked to the series

  Scenario: adding a schedule on edit links the existing task
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I add a weekly Monday schedule to Alpha
    Then the task update succeeds
    And the series list has 1 series
    And the task is linked to the series

  Scenario: rescheduling an already-linked task is rejected
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    And I add a weekly Monday schedule to the linked task
    Then the task update fails
    And the series list has 1 series

  Scenario: series are scoped to their owning profile
    Given an application state on a temporary seeded database
    And a second profile exists
    When I create a task titled "Standup" repeating weekly on Monday
    And the application switches to the second profile
    Then the series list is empty
