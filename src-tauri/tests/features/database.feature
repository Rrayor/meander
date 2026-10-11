Feature: Persistence layer

  Scenario: Connecting to a fresh database applies migrations and can be seeded
    Given a temporary database path
    When I connect the persistence layer
    Then all migrations are applied
    When I seed the database
    Then the database records that it was seeded
