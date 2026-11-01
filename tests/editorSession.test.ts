import { expect, it } from "vitest";
import { EditorSession } from "../src/core/editorSession";
import { createDocument } from "../src/core/model";
import { undoHistory, redoHistory } from "../src/core/history";
import { twoPinSymbol } from "./fixtures";

it("checks and commits a versioned batch once, including after undo and project replacement", () => {
  const initial = createDocument({pageId:"page"});
  const session = new EditorSession(initial);
  const request = {tool:"edit_page",pageId:"page",requestId:"batch",sessionId:session.sessionId,expectedRevision:0,
    operations:[
      {type:"place",id:"a",symbolId:"resistor",x:0,y:0},
      {type:"place",id:"b",symbolId:"resistor",x:100,y:0},
      {type:"connect",id:"w",start:{deviceId:"a",pinId:"1"},end:{deviceId:"b",pinId:"2"}},
    ]};
  const run = (input:unknown,busy=false) => session.request(input,"page",[{...twoPinSymbol,palette:true}],busy);
  expect(()=>run(request,true)).toThrow("busy");
  expect(()=>run({...request,operations:[...request.operations,{type:"place",id:"a",symbolId:"resistor",x:10,y:0}]})).toThrow("duplicate");
  expect(session.snapshot().present).toBe(initial);
  expect(run(request)).toMatchObject({committedRevision:1,replayed:false});
  expect(session.snapshot().past).toHaveLength(1);
  expect(()=>run({...request,requestId:"other"})).toThrow("revision_conflict");
  expect(()=>run({...request,operations:request.operations.slice(1)})).toThrow("request_id_reused");
  session.update(undoHistory);
  expect(session.snapshot().present).toBe(initial);
  expect(run(request)).toMatchObject({committedRevision:1,revision:2,replayed:true});
  session.update(redoHistory);
  expect(session.snapshot().present.pages[0]?.nets[0]?.wires).toHaveLength(1);
  session.replace(initial);
  expect(()=>run(request)).toThrow("stale_session");
});
