# Endpoint Tester

## Overview

The Endpoint Tester is a browser based interface for sending one REST request at a time and checking its HTTP status and, optionally, its complete JSON response. Results, assertions, and errors are displayed directly in the interface.

## Prerequisites

- Node.js 20.19+ or 22.12+ (the repository's documented baseline, including built in Fetch support).
- npm, which is installed with Node.js.
- A network connection from this machine to the endpoint you want to test.

The framework dependencies are installed from the repository's lockfile. No separate API backend, `.env` file, or external UI dependency is required.

## Installation

Open a terminal in the repository root, `Universal Backend Testing Framework`, and install dependencies:

```sh
npm ci
```

## Running the Endpoint Tester

Run the following command from the repository root:

```sh
npm run endpoint-tester
```

This starts one Node.js process. It serves the UI and handles test requests in the same process, so there is no second framework backend to start. By default, open:

```text
http://127.0.0.1:4173
```

Leave the terminal open while using the UI. To stop the server, focus that terminal and press **Ctrl+C**.

The server listens on `127.0.0.1`. You can choose a different port with `UBTF_PORT` before starting it. For example, in PowerShell:

```powershell
$env:UBTF_PORT = '4174'
npm run endpoint-tester
```

Then visit `http://127.0.0.1:4174`. In macOS or Linux shells, use:

```sh
UBTF_PORT=4174 npm run endpoint-tester
```

`UBTF_HOSTED=true` enables an additional safety check that rejects private and local target addresses; it is not needed for ordinary local use. No other Endpoint Tester environment configuration is required.

## Using the Interface

1. Enter a complete endpoint URL beginning with `http://` or `https://`, such as `https://api.example.com/items`.
2. Choose an HTTP method: `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`.
3. Enter the expected HTTP status code. The default is `200`; valid values are from `100` through `599`.
4. For `POST`, `PUT`, or `PATCH`, optionally enter a JSON request body. The body must be valid JSON. `GET` and `DELETE` do not send a body through this interface.
5. Optionally enter the complete expected JSON object or array in **Expected Response JSON**. When supplied, every field, value, type, array length, and array position is checked; object key order does not matter. Leave it empty for status-only checking. Invalid JSON is reported before the request is sent.
6. To authenticate or add other request headers, expand **Headers & Authentication**. Enter a Bearer Token if required, or choose **Add header** and fill in the header name and value. Added headers can be removed with the **×** button. A Bearer Token is sent as `Authorization: Bearer <token>`.
7. Select **Run Test**.

The result is **PASSED** only when the actual HTTP status equals the expected status and, if provided, the complete response JSON matches. Object key order is ignored; arrays are compared by length and index. Mismatches show the relevant path and expected/actual values. The response area shows the actual status and status text (or `No response` if the request did not receive one), response body, and elapsed time when available. Expand **Response details** to see the expected status, response time and size, response headers, and assertion details. A request execution error, such as a timeout or network error, appears as an error message.

## Troubleshooting

### Port already in use

The default port is `4173`. Stop the other process using it, or start the tester on another port, for example:

```powershell
$env:UBTF_PORT = '4174'
npm run endpoint-tester
```

Open `http://127.0.0.1:4174` when using that example. If you set `UBTF_PORT` in a terminal session, clear or change it before a later start if you want to return to the default.

### The UI server is not responding

Check that `npm run endpoint-tester` is still running in the terminal and that the startup message shows the same port as the URL in your browser. If startup reports a missing module, return to the repository root and run `npm ci`, then start the tester again.

### Invalid endpoint URL

Use a complete absolute `http://` or `https://` URL. Do not put a username or password in the URL; use the Bearer Token field or a custom header for credentials.

### Connection refused or request failed

The Endpoint Tester UI server and the endpoint being tested are separate network destinations. Confirm the target service is running, the host and port in the endpoint URL are correct, and this computer can reach it. A refusal or network error is shown with the test result as a request execution failure. Requests time out after 15 seconds by default.

### Invalid JSON request body

For `POST`, `PUT`, or `PATCH`, check that the body is valid JSON, including double quotes around property names and string values. For example:

```json
{
  "name": "Example"
}
```

An invalid JSON body is rejected and its error is shown in the response area. Clear the body for requests that do not need one.
