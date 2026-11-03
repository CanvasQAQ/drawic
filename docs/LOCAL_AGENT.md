# Local Agent editing

## Connect your MCP client

Open your project in the Drawic desktop app. Your local MCP client needs Node.js
20 or later on its PATH.

1. Open the **Agent** button in the upper-right corner of the title bar and select **Enable Agent**.
2. Select **Copy all for Agent**. If copying fails, select the setup text and copy it manually.
3. Merge the `drawic` entry from the configuration into your client's local stdio settings.
4. Restart or reconnect the client, keep the project open, and call `read_page` to check that the client can read the active page.

The configuration is private. It authorizes reading and editing the current drawing, including unsaved content. The adapter communicates over stdio with the client and a private operating-system socket or named pipe with Drawic. No TCP port is opened. Drawic starts with access disabled and does not persist the credential.

To end access, select **Disable Agent**. Enabling access again creates a new
credential, so repeat the setup steps to reconnect. The browser preview shows
the setup dialog, but connections require the desktop app.

## Agent workflow

1. Call `read_page` for the current page ID, session ID, revision and object counts. Results include at most 50 nodes, wires and symbol IDs per page. Use offset to continue and symbolId to inspect pin keys, roles, sides and the symbol frame. Symbol pin coordinates are local to its frame; each returned node also lists transformed pins in drawing coordinates. Returned wire points are resolved against current pin positions.
2. Use `edit_page` with the observed pageId, sessionId and expectedRevision and a fresh requestId. Supply unique document-wide IDs for new objects; `transform` uses an existing node ID. Operations run in order, so later operations may reference devices placed earlier in the batch. Coordinates are drawing units on a 10-unit grid. Connections route between transformed pin positions.
3. A successful batch produces one undo step. Read after editing to see current IDs, auto-assigned references and wire endpoints. A user can undo and redo in the drawing without changing the viewport. Dirty drawings use the ordinary project save flow.

Example operations, assuming a prior read confirmed the indicated symbol and pin keys:

```json
[
  {"type":"place","id":"bench-a","symbolId":"resistor","x":100,"y":100},
  {"type":"place","id":"bench-b","symbolId":"resistor","x":200,"y":100},
  {"type":"connect","id":"bench-wire","start":{"deviceId":"bench-a","pinId":"1"},"end":{"deviceId":"bench-b","pinId":"2"}}
]
```

`place` accepts optional `rotation` (0, 90, 180 or 270), `mirrored` (horizontal flip of local X) and `mirroredVertically` (vertical flip of local Y). Mirrors apply before rotation. Omitted values default to 0 and false. `transform` sets absolute position or orientation fields on an existing device; omitted fields retain their previous value. At least one field must be supplied. For example:

```json
[
  {"type":"place","id":"mirror-load","symbolId":"pmos","x":-120,"y":-100,"mirrored":true},
  {"type":"transform","id":"mirror-load","x":-100,"rotation":180,"mirrored":false}
]
```

Connected transforms keep pin identity and electrical connections. The editor resolves wire endpoints from new pin positions and locally stretches attached geometry. It does not reroute every connected wire around obstacles. New `connect` operations use automatic orthogonal routing and transformed pin directions. Inspect `read_page` after a transform to review the final path. A failed operation publishes none of its batch. One successful batch is one undo step; undo and redo advance revision. An identical requestId replay returns the original receipt even after undo and does not restore undone objects.

Only repeat identical arguments when the outcome is uncertain. A replay reports the original committedRevision and the current revision. On revision_conflict or stale_session, read again, reassess and use a new requestId. A busy workspace must finish its gesture or draft first. Page switching keeps the session but writes must target the active page. Opening, recovering or creating a project invalidates the prior session.

The adapter provides oriented placement, existing-device transformation and pin-to-pin connection on the active page. It limits requests to 32 KiB, batches to 32 operations and deduplication to the most recent 128 successes per session. Edits on large pages are restricted. Transport requests expire after 10 seconds. Drawing history is shared with manual edits and holds at most 150 past steps with an approximate 64 MiB undo budget. There are no change notifications. Project file operations and editing the device library remain UI operations.

Run `npm run build` followed by `npm run test:agent:desktop` for the real-client desktop acceptance test.
