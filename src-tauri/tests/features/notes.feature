Feature: Task notes
  Notes attach to a task, an instance of a repeating task, or the series
  itself. They live outside the task's other edits and are managed freely.

  Scenario: adding a note to a task
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I add a note "call the venue" to Alpha
    Then the update succeeds
    And Alpha has the note "call the venue"

  Scenario: editing a note rewrites it
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I add a note "draft" to Alpha
    And I edit Alpha's note "draft" to "final wording"
    Then the update succeeds
    And Alpha has the note "final wording"
    And Alpha has no note "draft"

  Scenario: deleting a note removes it
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I add a note "temporary" to Alpha
    And I delete Alpha's note "temporary"
    Then the update succeeds
    And Alpha has no notes

  Scenario: an instance note stays off the series
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    And I add a note "bring metrics" to Standup
    Then the update succeeds
    And Standup has the note "bring metrics"
    And Standup's repeat has no notes

  Scenario: a series note stays off the instances
    Given an application state on a temporary seeded database
    When I create a task titled "Standup" repeating weekly on Monday
    And I add a series note "shared agenda" to Standup's repeat
    Then the update succeeds
    And Standup's repeat has the note "shared agenda"
    And Standup has no notes

  Scenario: a blank note is rejected
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    When I try to add a blank note to Alpha
    Then the update fails
    And Alpha has no notes

  Scenario: another profile's task cannot take notes
    Given an application state on a temporary seeded database
    And a task exists on a second profile
    When I try to note "spy" on the foreign task
    Then the update fails
