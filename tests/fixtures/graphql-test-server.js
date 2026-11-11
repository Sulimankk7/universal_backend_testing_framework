import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { buildSchema, graphql } from 'graphql';
import { createGraphQLTestData } from './graphql-test-data.js';

const GRAPHQL_PATH = '/graphql';
const MAX_REQUEST_BYTES = 1024 * 1024;

const schema = buildSchema(`#graphql
  type User {
    id: ID!
    name: String!
  }

  type Query {
    users: [User!]!
    user(id: ID!): User
    explode: String!
  }

  type Mutation {
    createUser(name: String!): User!
    renameUser(id: ID!, name: String!): User
  }
`);

/**
 * Create an isolated HTTP GraphQL server using a fresh in-memory data set.
 * The returned server is not listening until its caller invokes `listen`.
 *
 * @returns {import('node:http').Server} Unstarted HTTP test server.
 */
export function createGraphQLTestServer() {
  const data = createGraphQLTestData();

  return createServer(async (request, response) => {
    if (request.url !== GRAPHQL_PATH) {
      sendJSON(response, 404, {
        errors: [{ message: `No GraphQL endpoint at ${request.url}.` }],
      });
      return;
    }

    if (request.method !== 'POST') {
      sendJSON(response, 405, { errors: [{ message: 'GraphQL requests must use POST.' }] });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(await readRequestBody(request));
    } catch (error) {
      const status = error instanceof RequestTooLargeError ? 413 : 400;
      sendJSON(response, status, { errors: [{ message: error.message }] });
      return;
    }

    if (!payload || typeof payload.query !== 'string') {
      sendJSON(response, 400, { errors: [{ message: 'A GraphQL query string is required.' }] });
      return;
    }

    const rootValue = {
      users: () => data.users,
      user: ({ id }) => data.users.find((user) => user.id === id) ?? null,
      createUser: ({ name }) => {
        const user = { id: `created-${data.nextUserId++}`, name };
        data.users.push(user);
        return user;
      },
      renameUser: ({ id, name }) => {
        const user = data.users.find((candidate) => candidate.id === id);
        if (!user) return null;
        user.name = name;
        return user;
      },
      explode: () => {
        throw new Error('Intentional GraphQL test resolver error.');
      },
    };

    try {
      const result = await graphql({
        schema,
        source: payload.query,
        variableValues: payload.variables,
        rootValue,
      });
      sendJSON(response, 200, result);
    } catch (error) {
      sendJSON(response, 500, { errors: [{ message: error.message }] });
    }
  });
}

/**
 * Start the isolated GraphQL test server.
 *
 * @param {{ host?: string, port?: number }} [options] Listen address.
 * @returns {Promise<import('node:http').Server>} Listening server.
 */
export async function startGraphQLTestServer({ host = '127.0.0.1', port = 4010 } = {}) {
  const server = createGraphQLTestServer();
  server.listen(port, host);
  await once(server, 'listening');
  return server;
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      tooLarge = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) throw new RequestTooLargeError('GraphQL request body exceeds the size limit.');
  return Buffer.concat(chunks).toString('utf8');
}

function sendJSON(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

class RequestTooLargeError extends Error {}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.GRAPHQL_TEST_PORT ?? 4010);
  const server = await startGraphQLTestServer({ port });
  console.info(`Isolated GraphQL test server listening at http://127.0.0.1:${port}${GRAPHQL_PATH}`);
  const close = () => server.close();
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
