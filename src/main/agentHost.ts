import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentRequest, type AgentRequest } from "../core/agentCommands";

export class AgentHost {
  private server?: Server;
  private clients = new Set<Socket>();
  private directory = "";
  private pending = new Map<string, (json: string) => void>();
  async start(adapter: string, dispatch: (id: string, request: AgentRequest) => void) {
    if (this.server) throw new Error("Agent is already enabled");
    const token = randomBytes(32).toString("hex");
    const server = createServer(socket => {
      if (this.clients.size >= 8) { socket.destroy(); return; }
      this.clients.add(socket);
      socket.setTimeout(10000, () => socket.destroy());
      let body = "", bytes = 0, id = "";
      socket.setEncoding("utf8");
      socket.on("error", () => socket.destroy());
      socket.on("close", () => { this.clients.delete(socket); this.pending.delete(id); });
      socket.on("data", chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 32768 || id) { socket.destroy(); return; }
        body += chunk;
        if (!body.includes("\n")) return;
        try {
          const message = JSON.parse(body);
          if (message.token !== token) throw new Error("unauthorized");
          const request = agentRequest.parse(message.request);
          id = randomUUID();
          this.pending.set(id, json => socket.end(json + "\n"));
          dispatch(id, request);
        } catch { socket.end('{"error":"invalid_or_unauthorized_request"}\n'); }
      });
    });
    this.server = server;
    try {
      const windows = process.platform === "win32";
      if (!windows) this.directory = await mkdtemp(join(tmpdir(), "drawic-"));
      const endpoint = windows ? '\\\\.\\pipe\\drawic-' + randomUUID() : join(this.directory,"agent.sock");
      await new Promise<void>((resolve,reject) => { server.once("error", reject); server.listen(endpoint, resolve); });
      return JSON.stringify({ mcpServers: { drawic: { command:"node", args:[adapter], env:{ DRAWIC_ENDPOINT:endpoint, DRAWIC_TOKEN:token } } } }, null, 2);
    } catch (error) { await this.stop(); throw error; }
  }
  reply(id: string, response: unknown) {
    const send = this.pending.get(id);
    if (!send) return;
    this.pending.delete(id);
    try {
      if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error();
      const json = JSON.stringify(response);
      if (Buffer.byteLength(json) > 240000) throw new Error();
      send(json);
    } catch {
      send('{"error":"invalid_renderer_response"}');
    }
  }
  async stop() {
    for (const socket of this.clients) socket.destroy();
    this.pending.clear();
    const server = this.server;
    if (server?.listening) await new Promise<void>(resolve => server.close(()=>resolve()));
    if (this.directory) await rm(this.directory,{recursive:true,force:true});
    this.directory = "";
    delete this.server;
  }
}
