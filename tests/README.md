# Testing Guide

This guide documents the commands and prerequisites defined by the repository's current `package.json` and Vitest configuration files. Run commands from the repository root.

## Prerequisites and installation

- Node.js supported by the locked Vitest toolchain and with built-in Fetch support. Node 20.19+ or Node 22.12+ is a suitable baseline for the current lockfile.
- npm, using the committed `package-lock.json`.
- Internet access only for the external Rick and Morty GraphQL suite and dependency installation.

Install the locked dependencies:

```bash
npm ci
```

The framework test configurations do not require a project `.env` file. Shared Table's own local PostgreSQL configuration must be set in that backend project.

## All unit tests

Run all files under `tests/unit/`:

```bash
npx vitest run tests/unit
```

This selects the Core, REST, GraphQL, and Vitest adapter unit tests. Unit tests do not require a backend service.

## Complete default Vitest suite

Run the repository's default configured suite:

```bash
npm test
```

The `test` script runs `vitest run --config config/vitest/vitest.config.js`. `config/vitest/vitest.config.js` includes every unit test and `tests/integration/reporter.integration.test.js`. This default command does **not** include the three backend integration suites, which have dedicated configurations.

## Integration suites

Run each dedicated suite separately.

### Shared Table REST

```bash
npm run test:integration
```

Requires the Shared Table REST API at `http://localhost:3000/api`, with its PostgreSQL connection and expected tables configured in the Shared Table backend. The test creates uniquely named users and products, exercises CRUD and error cases, then attempts cleanup of only its own records.

### Local GraphQL

```bash
npm run test:graphql
```

No separate server is required. The test creates an in-process GraphQL fixture server bound to an ephemeral loopback port and closes it after the test.

### External Rick and Morty GraphQL

```bash
npm run test:rick-and-morty
```

Requires Internet connectivity to `https://rickandmortyapi.com/graphql`. This suite performs read-only queries and does not require credentials or local services.

## Latest verification in this workspace

| Suite | Result |
|---|---|
| `npm test` — unit tests and reporter integration | 206/206 passed across 20 files |
| `npm run test:graphql` — local GraphQL fixture | 5/5 passed |
| `npm run test:rick-and-morty` — external GraphQL API | 5/5 passed |
| `npm run test:integration` — Shared Table REST | Not available: the local backend at `http://localhost:3000/api` could not be reached (`fetch failed`) |

All commands above use configurations in `config/vitest/`. The Shared Table configuration was invoked, but its local service was unavailable in this environment.
