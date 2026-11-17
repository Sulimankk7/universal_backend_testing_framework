# Testing Guide

This guide documents the commands and prerequisites defined by the repository's current `package.json` and Vitest configuration files. Run all commands from the repository root.

## Prerequisites and Installation

- **Node.js:** Node 20.19+ or Node 22.12+ is a suitable baseline for the current locked Vitest toolchain.
- **npm:** Use npm with the committed `package-lock.json`.
- **Internet access:** Required for dependency installation and the external Rick and Morty GraphQL test suite.

Install the locked dependencies:

```bash
npm ci
```

The framework's test configurations do not require a project `.env` file. However, Shared Table's local PostgreSQL configuration must be set up in the Shared Table backend project before running its REST integration tests.

## Default Test Suite

Run the repository's default test suite:

```bash
npm test
```

This command executes:

- All unit tests under `tests/unit/`, covering the Core, REST, GraphQL, and Vitest adapters.
- The reporter integration test at `tests/integration/reporter.integration.test.js`.

The command uses the configuration defined in `config/vitest/vitest.config.js`.

No backend service or project `.env` file is required for this suite.

**Note:** The default test suite does not include the dedicated backend integration suites described below.

## Integration Test Suites

Each integration suite has its own npm script and Vitest configuration. Run them separately depending on the functionality you want to verify.

### 1. Shared Table REST Integration

```bash
npm run test:integration
```

**Prerequisites:**

- The Shared Table REST API must be running at `http://localhost:3000/api`.
- Its PostgreSQL connection must be configured.
- The expected database tables must exist.

This suite tests REST API operations, including CRUD functionality and error scenarios.

It creates uniquely named users and products during execution and attempts to clean up only the records it created.

### 2. Local GraphQL Integration

```bash
npm run test:graphql
```

No separate GraphQL server is required.

The test creates an in-process GraphQL fixture server bound to an ephemeral loopback port and closes it after execution.

This suite verifies the GraphQL adapter against a controlled local environment.

### 3. External Rick and Morty GraphQL Integration

```bash
npm run test:rick-and-morty
```

**Prerequisites:**

- Internet connectivity.
- Access to `https://rickandmortyapi.com/graphql`.

This suite runs read-only GraphQL queries against the public Rick and Morty API.

No credentials or local backend services are required.

## Latest Verification Results

The following results were recorded during the latest verification in the development workspace:

| Test Suite | Result |
|---|---|
| `npm test` — Unit tests and reporter integration | 206/206 passed across 20 files |
| `npm run test:graphql` — Local GraphQL fixture | 5/5 passed |
| `npm run test:rick-and-morty` — External GraphQL API | 5/5 passed |
| `npm run test:integration` — Shared Table REST | Not completed: the local backend at `http://localhost:3000/api` could not be reached (`fetch failed`) |

The Shared Table REST configuration was invoked, but the required local service was unavailable in that environment.

## Configuration Reference

All Vitest configurations are located in:

```text
config/vitest/
├── vitest.config.js
├── vitest.integration.config.js
├── vitest.graphql.integration.config.js
└── vitest.rick-and-morty.integration.config.js
```

Each configuration defines a separate test scope and its required environment.

For additional details about individual configurations, refer to `config/vitest/README.md`.
