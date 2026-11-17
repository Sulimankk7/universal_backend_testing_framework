# Vitest Configurations

This directory holds the separate Vitest configurations used by UBTF. Each selects a different test suite and the environment that suite needs. Keeping them separate makes the default unit run fast and lets each integration suite state its service requirements clearly.

## Configuration files

### `vitest.config.js`

Runs unit tests under `tests/unit/**/*.test.js` and the reporter integration test at `tests/integration/reporter.integration.test.js`. It uses the UBTF Vitest reporter at `src/adapters/vitest/vitest-reporter.js`. No backend service is required.

### `vitest.integration.config.js`

Tests the Shared Table REST backend using `tests/integration/shared-table-rest.integration.test.js`. Requires the local backend at `http://localhost:3000/api` and its configured PostgreSQL connection and expected tables. The test creates unique records and attempts cleanup.

### `vitest.graphql.integration.config.js`

Tests the GraphQL adapter using `tests/integration/graphql-adapter.integration.test.js` and a local GraphQL fixture server. The test creates and closes its own server on an ephemeral loopback port; no external GraphQL service is required.

### `vitest.rick-and-morty.integration.config.js`

Tests UBTF's GraphQL capabilities against the external public Rick and Morty GraphQL API at `https://rickandmortyapi.com/graphql`. It demonstrates sending GraphQL queries, receiving responses, and validating returned data against a real external GraphQL service. It requires Internet access, but no local backend setup or credentials. Queries are read-only.

## Running tests

Run commands from the repository root. Each command runs only its selected suite:

| Suite | Command | Prerequisites |
|---|---|---|
| Unit tests and reporter integration | `npm test` | None |
| Shared Table REST | `npm run test:integration` | Local Shared Table backend and database described above |
| Local GraphQL fixture | `npm run test:graphql` | None; the test starts its fixture server |
| Rick and Morty GraphQL | `npm run test:rick-and-morty` | Internet access to the public endpoint |

The corresponding direct Vitest commands are:

```bash
npx vitest run --config config/vitest/vitest.config.js
npx vitest run --config config/vitest/vitest.integration.config.js
npx vitest run --config config/vitest/vitest.graphql.integration.config.js
npx vitest run --config config/vitest/vitest.rick-and-morty.integration.config.js
```

Use the default configuration for routine local unit checks. Run the service-specific configuration when validating its adapter against the named backend. The Rick and Morty suite checks connectivity and response handling against a real public GraphQL API.
