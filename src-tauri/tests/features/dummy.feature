Feature: Service layer smoke check

  Scenario: The application core answers a health check
    Given the application core
    When I request a health check
    Then the answer is "ok"
