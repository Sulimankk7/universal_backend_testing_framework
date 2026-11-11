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

The `test` script runs `vitest run`. `vitest.config.js` includes every unit test and `tests/integration/reporter.integration.test.js`. This default command does **not** include the four backend integration suites, which have dedicated configurations.

## Integration suites

Run each dedicated suite separately.

### Shared Table REST

```bash
npx vitest run --config vitest.integration.config.js
```

Requires the Shared Table REST API at `http://localhost:3000/api`, with its PostgreSQL connection and expected tables configured in the Shared Table backend. The test creates uniquely named users and products, exercises CRUD and error cases, then attempts cleanup of only its own records.

### Local GraphQL

```bash
npx vitest run --config vitest.graphql.integration.config.js
```

No separate server is required. The test creates an in-process GraphQL fixture server bound to an ephemeral loopback port and closes it after the test.

### PocketBase REST

```bash
npx vitest run --config vitest.pocketbase.integration.config.js
```

Requires a local PocketBase server at `http://127.0.0.1:8090` and public access to the `products` collection. The collection fields used are `Name` (capital N), `price`, and `stock`. The test creates a unique product and deletes only the record ID returned by its own create request; cleanup also runs after failures.

### External Rick and Morty GraphQL

```bash
npx vitest run --config vitest.rick-and-morty.integration.config.js
```

Requires Internet connectivity to `https://rickandmortyapi.com/graphql`. This suite performs read-only queries and does not require credentials or local services.

## Standalone Node.js validation

```bash
node scripts/pocketbase-standalone-validation.js
```

Requires the same local PocketBase service and public `products` collection as the PocketBase integration suite. The script uses the existing framework REST components directly and does not import Vitest or another test runner. It creates and tracks its own unique product ID, then uses `try/finally` cleanup to delete only that record.

The script covers six real HTTP scenarios: list products, create a product, read it by ID, update it, delete it, and verify a `404` after deletion. It then performs one deliberate assertion failure to verify result collection and `FailureAnalyzer` classification as `assertion_failure`. That failure is expected evidence for the demonstration; it is not a failed REST scenario.

## Expected validation results

The project owner reported these completed results:

| Command / suite | Reported result |
|---|---:|
| `npm test` — unit tests and reporter integration | 135/135 passed |
| `vitest.integration.config.js` — Shared Table REST | 1/1 passed |
| `vitest.graphql.integration.config.js` — local GraphQL | 5/5 passed |
| `vitest.pocketbase.integration.config.js` — PocketBase REST | 1/1 passed |
| `vitest.rick-and-morty.integration.config.js` — external GraphQL | 5/5 passed |
| All Vitest suites combined | 147/147 passed across 19 test files |
| Standalone Node.js PocketBase validation | 6 HTTP scenarios passed; deliberate failure classified as `assertion_failure` |

These are the reported validation results, not a guarantee that external APIs or local services will be available on every run. The standalone assertion failure is intentional and should appear as a failed result in its printed collector output while the validation itself completes successfully when its classification check succeeds.
