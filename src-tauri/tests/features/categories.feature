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
