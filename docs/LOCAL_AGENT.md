# Local Agent editing

Open **Agent off** in the bottom status bar, then **Enable Agent**. Select the configuration text, copy it, and merge the drawic entry into your MCP client's local stdio settings. The client needs Node 20 or newer on PATH. Restart or reconnect the client after changing its configuration. Keep Drawic running on the desired project. **Disable Agent** closes the local endpoint. Enabling again creates a new credential and requires a fresh configuration.

The configuration is private. It authorizes reading and editing the current drawing, including unsaved content. The adapter communicates over stdio with the client and a private operating-system socket or named pipe with Drawic. No TCP port is opened. Drawic starts with access disabled and does not persist the credential.

## Agent workflow

1. Call `read_page` for the current page ID, session ID, revision and object counts. Results include at most 50 nodes, wires and symbol IDs per page of results. Use offset to continue and symbolId to inspect pin keys. Pin coordinates are relative to the device center.
2. Use `edit_page` with the observed pageId, sessionId and expectedRevision and a fresh requestId. Supply unique object IDs. Operations run in order, so later wires may reference devices placed earlier in the batch. Coordinates are drawing units on a 10-unit grid. Connections route between the actual device pin positions.
3. A successful batch produces one undo step. Read after editing to see current IDs, auto-assigned references and wire endpoints. A user can undo and redo in the drawing without changing the viewport. Dirty drawings use the ordinary project save flow.

Example operations, assuming a prior read confirmed the indicated symbol and pin keys:

```json
[
  {"type":"place","id":"bench-a","symbolId":"resistor","x":100,"y":100},
  {"type":"place","id":"bench-b","symbolId":"resistor","x":200,"y":100},
  {"type":"connect","id":"bench-wire","start":{"deviceId":"bench-a","pinId":"1"},"end":{"deviceId":"bench-b","pinId":"2"}}
]
```

Only repeat identical arguments when the outcome is uncertain. A replay reports the original committedRevision and the current revision. On revision_conflict or stale_session, read again, reassess and use a new requestId. A busy workspace must finish its gesture or draft first. Page switching keeps the session but writes must target the active page. Opening, recovering or creating a project invalidates the prior session.

The first release provides placement and pin-to-pin connection on the active page. It limits requests to 32 KiB, batches to 32 operations and deduplication to the most recent 128 successes per session. Edits on large pages are restricted. Transport requests expire after 10 seconds. Drawing history is shared with manual edits and holds at most 150 past steps with an approximate 64 MiB undo budget. There are no change notifications. Project file operations and editing the device library remain UI operations.

Run `npm run build` followed by `npm run test:agent:desktop` for the real-client desktop acceptance test.

The upper-right **Agent** button opens setup. After enabling the connection, use
**Copy configuration** or **Copy all for Agent** to copy the private setup text
to your local MCP client. Copy failures leave selectable text for manual copying.
Browser preview shows this entry and instructions but cannot enable a connection.
