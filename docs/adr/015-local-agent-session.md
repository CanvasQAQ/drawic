# ADR 015: Local Agent editing session

The renderer owns a synchronous editor session. Both UI operations and Agent edits publish the same immutable document history. The session checks the expected version and validates a candidate before publishing it in one synchronous call. History changes advance revision, including undo and redo. A project replacement invalidates receipts and replaces the session ID.

An optional stdio MCP adapter communicates with main over an OS-local authenticated endpoint. Main validates requests and sends only typed editing requests through preload to the active renderer. Main never holds a writable mirror of the document. The renderer keeps its offline sandbox. Closing the window or disabling the endpoint releases its connections.

Device workspace Save and Undo belong to the active editor. Save in the device editor applies to the draft library. Save in the manager persists the library. Native Save-before-close must persist outstanding workspace edits and a dirty drawing before allowing close.

See [Local Agent editing](../LOCAL_AGENT.md) for setup, retry semantics and capability limits.
