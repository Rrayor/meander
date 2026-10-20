Feature: Repeating tasks
  A task can repeat on a schedule so routine work does not need to be
  re-entered. The task the user created remains an ordinary task — the
  schedule persists alongside it as its series.

  Scenario: creating a task that repeats
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    Then the task creation succeeds
    And a task titled "Standup" exists in the backlog
    And Standup repeats weekly on Monday

  Scenario: making an existing task repeat
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I make Alpha repeat weekly on Monday
    Then the task update succeeds
    And Alpha repeats weekly on Monday
    And Alpha is still the same task

  Scenario: a repeating task's schedule belongs to its series
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    And I try to change Standup's schedule
    Then the task update fails
    And Standup still repeats weekly on Monday

  Scenario: repeating tasks are not shared across profiles
    Given an application state on a temporary seeded database
    And a second profile exists
    When I create a task titled "Standup" repeating weekly on Monday
    And the application switches to the second profile
    Then no repeating tasks exist
