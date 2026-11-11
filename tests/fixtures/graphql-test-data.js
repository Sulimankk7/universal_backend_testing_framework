/**
 * Create isolated, in-memory data for one GraphQL test server instance.
 * Mutations affect only this returned object and are discarded with the server.
 */
export function createGraphQLTestData() {
  return {
    users: [
      { id: 'user-1', name: 'Ada Lovelace' },
      { id: 'user-2', name: 'Grace Hopper' },
    ],
    nextUserId: 1,
  };
}
