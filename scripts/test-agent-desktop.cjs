// Launch using Electron, with a disposable profile and a real stdio MCP client.
const { app, BrowserWindow } = require("electron");
const { mkdtempSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
app.setPath("userData",mkdtempSync(join(tmpdir(),"drawic-agent-test-")));
require("../dist/main/main.js");

async function until(fn) {
  for (let i=0;i<100;i++) {
    const result = await fn();
    if (result) return result;
    await new Promise(r=>setTimeout(r,50));
  }
  throw new Error("Desktop condition timed out");
}
async function test() {
  await app.whenReady();
  const win = await until(()=>BrowserWindow.getAllWindows()[0]);
  const js = code=>win.webContents.executeJavaScript(code);
  const click = text=>js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==="+JSON.stringify(text)+")?.click()");
  await until(()=>js("document.querySelector('.agent-trigger')?.getAttribute('aria-label') === 'Agent Off'"));
  await js("document.querySelector('.agent-trigger').click()");
  await click("Enable Agent");
  const config = JSON.parse(await until(()=>js("document.querySelector('textarea[aria-label=\"Agent connection configuration\"]')?.value"))).mcpServers.drawic;
  const client = new Client({name:"drawic-desktop-test",version:"1"});
  try {
    await client.connect(new StdioClientTransport(config));
    const call = async (name,args) => {
      const result = await client.callTool({name,arguments:args});
      return JSON.parse(result.content[0].text);
    };
    await js("document.querySelector('.export-dialog button[aria-label=Close]').click()");
    const page = await call("read_page",{symbolId:"resistor"});
    assert.equal(page.nodeCount,0);
    const batch = {pageId:page.pageId,sessionId:page.sessionId,expectedRevision:page.revision,requestId:"desktop-batch",operations:[
      {type:"place",id:"a",symbolId:"resistor",x:100,y:100},
      {type:"place",id:"b",symbolId:"resistor",x:200,y:100},
      {type:"connect",id:"w",start:{deviceId:"a",pinId:page.pins[0].key},end:{deviceId:"b",pinId:page.pins[1].key}},
    ]};
    const results = await Promise.all([call("edit_page",batch),call("edit_page",{...batch,requestId:"competitor"})]);
    assert.equal(results.filter(r=>r.error==="revision_conflict").length,1);
    const winner = results[0].error ? {...batch,requestId:"competitor"} : batch;
    const ink = ()=>js("[document.querySelectorAll('.component-node').length, document.querySelectorAll('.wire-visible').length]");
    await until(async()=>(await ink()).join()==="2,1");
    assert(await js(`Array.from(document.querySelectorAll('.component-node, .wire-visible')).every(element => {
      const rect = element.getBoundingClientRect();
      const view = element.closest('svg').getBoundingClientRect();
      return rect.width > 0 && rect.left >= view.left && rect.right <= view.right && rect.top >= view.top && rect.bottom <= view.bottom;
    })`), "placed devices and wire should be inside the visible canvas");
    await js("document.querySelector('button[aria-label=Undo]').click()");
    await until(async()=>(await ink()).join()==="0,0");
    const replay = await call("edit_page",winner);
    assert(replay.replayed && replay.revision > replay.committedRevision);
    await js("document.querySelector('.agent-trigger').click()");
    await click("Disable Agent");
    await until(()=>js("document.querySelector('.agent-trigger')?.getAttribute('aria-label') === 'Agent Off'"));
    assert(!existsSync(config.env.DRAWIC_ENDPOINT));
    console.log("PASS: real MCP client, concurrent batch, two SVG devices and one wire, one UI undo, replay and disable");
  } finally { await client.close(); }
}
test().then(()=>app.exit(0),e=>{console.error(e);app.exit(1)});
