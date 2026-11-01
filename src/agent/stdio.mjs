import { connect } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { editFields, readFields } from "../core/agentCommands";

async function invoke(request) {
  const endpoint = process.env.DRAWIC_ENDPOINT;
  if (!endpoint || !process.env.DRAWIC_TOKEN) throw new Error("Missing Drawic connection settings");
  const result = await new Promise((resolve,reject) => {
    const socket = connect(endpoint,()=>socket.write(JSON.stringify({ token:process.env.DRAWIC_TOKEN, request })+"\n"));
    socket.setEncoding("utf8");
    socket.setTimeout(10000,()=>socket.destroy(new Error("timeout")));
    let text = "";
    socket.on("data",chunk=>{ text += chunk; if (text.length>262144) socket.destroy(new Error("response_limit")); });
    socket.on("error",reject);
    socket.on("end",()=>text.trim()?resolve(text.trim()):reject(new Error("disconnected")));
  });
  return { content:[{type:"text",text:result}], isError:Boolean(JSON.parse(result).error) };
}
const server = new McpServer({name:"Drawic",version:"1.0.0"});
server.registerTool("read_page",{description:"Read active page, revision, paged nodes with orientation and world pin coordinates, resolved wire paths, and symbol IDs. Pass symbolId for pin keys, roles, sides and frame. Rotations: 0/90/180/270; mirrored flips local X, mirroredVertically flips local Y before rotation.",inputSchema:readFields},args=>invoke({tool:"read_page",...args}));
server.registerTool("edit_page",{description:"Atomically place devices with optional rotation/mirrors, transform an existing device by absolute x/y/orientation, and connect pin keys. Coordinates use a 10-unit grid. Connected transforms preserve pin anchors and locally stretch wires; they do not reroute entire paths. One batch is one undo step.",inputSchema:editFields},args=>invoke({tool:"edit_page",...args}));
server.resource("editing-rules","drawic://guide",async uri=>({contents:[{uri:uri.href,text:"Read page and pin keys first. Place objects before connecting them. Supply unique document-wide IDs. After conflict, re-read and use a new requestId. Retry uncertain outcomes using identical arguments. Replayed receipts do not guarantee the objects still exist."}]}));
void server.connect(new StdioServerTransport());
