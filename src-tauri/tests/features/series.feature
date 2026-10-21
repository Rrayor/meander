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

  Scenario: a repeat that ends before it starts is rejected
    Given an application state on a temporary seeded database
    When I try to create a task titled "Standup" whose repeat ends before it starts
    Then the task creation fails
    And the task list is empty

  Scenario: an unreadable repeat is rejected
    Given an application state on a temporary seeded database
    When I try to create a task titled "Standup" with an unreadable repeat
    Then the task creation fails
    And the task list is empty

  Scenario: another profile's task cannot be made to repeat
    Given an application state on a temporary seeded database
    And a task exists on a second profile
    When I try to make the foreign task repeat
    Then the task update fails
    And the second profile's task list has one task

  Scenario: removing a repeat removes the repeating task with it
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    And I remove Standup's repeat
    Then a task titled "Standup" no longer exists

  Scenario: retitling a repeat retitles every instance
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    And a later instance of Standup is titled "Offsite sync"
    When I retitle Standup's series to "Daily sync"
    Then the update succeeds
    And every instance of Standup's repeat is titled "Daily sync"

  Scenario: ending a repeat removes only its later instances
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    And a later instance of Standup exists
    When I end Standup's repeat at the later instance
    Then the update succeeds
    And the earlier instance of Standup remains
    And no instance of Standup remains on or after the later instance
