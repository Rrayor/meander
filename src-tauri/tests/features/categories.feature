Feature: Categories
  Categories are profile-scoped labels for grouping tasks. The categories
  view lists only the active profile's categories.

  Scenario: a fresh profile has an empty category list
    Given an application state on a temporary seeded database
    Then the category list is empty

  Scenario: categories are scoped to their owning profile
    Given an application state on a temporary seeded database
    And a category named Errands exists on the active profile
    And a category named Office exists on a second profile
    Then the category list is "Errands"
    And the second profile's category list is "Office"

  Scenario: categories carry audit timestamps
    Given an application state on a temporary seeded database
    And a category named Errands exists on the active profile
    Then the category Errands has audit timestamps

  Scenario: blank category titles are rejected
    Given an application state on a temporary seeded database
    When I insert a category with a blank title
    Then the insertion fails
    And the category list is empty

  Scenario: categories list alphabetically by title
    Given an application state on a temporary seeded database
    And a category named Builds exists on the active profile
    And a category named Admin exists on the active profile
    Then the category list is "Admin, Builds"

  Scenario: associating a category with a task is listed for the task
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a category named Errands exists on the active profile
    When I associate Errands with Alpha
    Then the association succeeds
    And the categories of Alpha are "Errands"

  Scenario: removing an association unlists it
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a category named Errands exists on the active profile
    And I associate Errands with Alpha
    When I remove Errands from Alpha
    Then the removal succeeds
    And the categories of Alpha are ""

  Scenario: associating another profile's category is rejected
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a category named Office exists on a second profile
    When I associate Office with Alpha
    Then the association fails
    And the categories of Alpha are ""

  Scenario: associating another profile's task is rejected
    Given an application state on a temporary seeded database
    And a task exists on a second profile
    And a category named Errands exists on the active profile
    When I associate Errands with the foreign task
    Then the association fails

  Scenario: deleting a category removes it from associated tasks
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a category named Errands exists on the active profile
    And I associate Errands with Alpha
    When the category Errands is deleted
    Then the categories of Alpha are ""
    And the category list is empty

  Scenario: deleting another profile's category is rejected
    Given an application state on a temporary seeded database
    And a category named Office exists on a second profile
    When the category Office is deleted
    Then the deletion fails
    And the second profile's category list is "Office"

  Scenario: deleting an unknown category is rejected
    Given an application state on a temporary seeded database
    And a category named Errands exists on the active profile
    When a category that does not exist is deleted
    Then the deletion fails
    And the category list is "Errands"

  Scenario: editing a category updates its fields for associated tasks
    Given an application state on a temporary seeded database
    And a backlog task titled Alpha
    And a category named Errands exists on the active profile
    And I associate Errands with Alpha
    When the category Errands is renamed to "Chores"
    Then the update succeeds
    And the category list is "Chores"
    And the categories of Alpha are "Chores"

  Scenario: editing another profile's category is rejected
    Given an application state on a temporary seeded database
    And a category named Office exists on a second profile
    When the category Office is renamed to "Work"
    Then the update fails
    And the second profile's category list is "Office"

  Scenario: editing an unknown category is rejected
    Given an application state on a temporary seeded database
    And a category named Errands exists on the active profile
    When a category that does not exist is updated
    Then the update fails
    And the category list is "Errands"

  Scenario: creating a category trims and defaults its color
    Given an application state on a temporary seeded database
    When I create a category with surrounding whitespace
    Then the category creation succeeds
    And a category named Errands exists in the list
    And the category Errands has the default color

  Scenario: creating a category with a picked color stores it
    Given an application state on a temporary seeded database
    When I create a category titled Errands with color "#4ADE80"
    Then the category creation succeeds
    And the category Errands has color "#4ade80"

  Scenario: blank category titles are rejected on creation
    Given an application state on a temporary seeded database
    When I create a category with a blank title
    Then the category creation fails
    And the category list is empty

  Scenario: an invalid category color is rejected
    Given an application state on a temporary seeded database
    When I create a category titled Errands with color "teal"
    Then the category creation fails

  Scenario: an overlong category description is rejected
    Given an application state on a temporary seeded database
    When I create a category with an overlong description
    Then the category creation fails
    And the category list is empty
