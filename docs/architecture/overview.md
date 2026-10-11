# Architectural overview

## Technological stack

- Tauri application: Rust "backend", Angular frontend
- Angular Material
- SQLite database
- Playwright for e2e testing
- Cucumber for acceptance testing
- GitHub actions for CI/CD
- Starlight for user guides

## Modular structure

Tauri by default requires separation of "backend and frontend". Though it allows for a very thin Rust layer and developing the majority of the application in TypeScript would be possible, Meander follows a more classical approach. The Rust side is responsible for state consistency. It handles database operations and validation as a traditional backend and Typescript is responsible for communicating that state to the user and allowing the user to send modification requests to the backend.

This is both for separation of concerns and to allow for a possible migration to an online architecture.

Database interactions need to be more robust for this reason than the minimum requirement of interacting with SQLite. We have a persistence layer responsible for transforming Rust objects into database entities and vice versa, a connection layer that currently only allows for connecting to SQLite but it is set up so in the future other SQL databases can be easily connected as well. And we have a service layer, where every operation happens with the involvement of Rust objects representing database entities. Business logic and validation happen here.

The frontend is an Angular Material application which already comes with it's own strict modularization requirements and conventions.

## Migrations

We use database migrations for maintainability and future proofing.

## Testing

As the development is AI assisted testing is an even more pronounced requirement. Every development has to be validated through thorough unit testing, e2e testing via playwright and acceptance testing via Cucumber.

Benchmarks are also set up to guard performance.

Use a separate test-database file which can be seeded for testing purposes.

## CI/CD

Every change must be validated before integrating into the main branch or releasing. GitHub actions is the easiest way we can do that.

## Documentation

The user-guide is using Starlight for easy development and consumption.