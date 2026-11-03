// Drive both themes through the real application using a disposable project and profile.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {app, BrowserWindow, nativeTheme, dialog} = require("electron");
const {createDocument, serializeProject} = require("../dist/core/model");
const {addComponent, addShape, addAnnotation, addWire} = require("../dist/core/editor");
const {parseDeviceLibrary, loadDeviceLibrary} = require("../dist/core/library");
const raw = require("../src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json");
const library = loadDeviceLibrary(parseDeviceLibrary(raw));
const profile = fs.mkdtempSync(path.join(os.tmpdir(),"drawic-theme-"));
app.setPath("userData",profile);
let doc = createDocument({pageId:"page"});
const symbol = library.byId.get("resistor");
doc = addComponent(doc,"page",{id:"r1",symbol,point:{x:120,y:100}});
doc = addComponent(doc,"page",{id:"r2",symbol,point:{x:250,y:100}});
doc = addWire(doc,"page",{id:"w1",points:[{x:120,y:120},{x:120,y:160},{x:250,y:160},{x:250,y:120}],
  startAnchor:{deviceId:"r1",pinId:"2"},endAnchor:{deviceId:"r2",pinId:"2"}});
doc.pages[0].nets[0].color="#087e93";
doc=addShape(doc,"page",{id:"note",x:145,y:190,width:130,height:65,kind:"note"});
doc=addAnnotation(doc,"page",{id:"label",kind:"text",text:"Bias network",point:{x:90,y:45}});
const file=path.join(profile,"workspace.drawic.json");
fs.writeFileSync(file,serializeProject(doc)); process.argv.push(file);
const recovery=path.join(profile,"recovery");
fs.mkdirSync(recovery);fs.copyFileSync(file,path.join(recovery,"previous.drawic.json"));
fs.writeFileSync(path.join(recovery,"latest.json"),JSON.stringify({file:"previous.drawic.json",savedAt:doc.modifiedAt,projectId:doc.id}));
const customRecord={...raw.devices[0],id:"custom-theme",title:"Bench symbol"};
const user={...raw,id:"drawic-user",devices:[customRecord]};
fs.mkdirSync(path.join(profile,"device-libraries"));
fs.writeFileSync(path.join(profile,"device-libraries","user.drawiclib.json"),JSON.stringify(user));
const incoming=path.join(profile,"incoming.drawiclib.json");
fs.writeFileSync(incoming,JSON.stringify({...user,devices:[{...customRecord,title:"Imported bench symbol"}]}));
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[incoming]});
require("../dist/main/main");
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,description) {
  for(let i=0;i<100;i++){const value=await fn();if(value)return value;await wait(40);}
  throw new Error("Timed out: "+description);
}

// Inspect text against the painted ancestor backgrounds. Document ink, disabled
// controls and invisible contents are outside the chrome contrast check.
function auditText(selector) {
  const root=document.querySelector(selector);
  if(!root)throw new Error("Missing "+selector);
  // Chromium may serialize Radix colors as display-p3. Read sRGB pixels for WCAG luminance.
  const pixel = document.createElement("canvas").getContext("2d", {willReadFrequently:true});
  const colors = new Map();
  function color(value) {
    if (!colors.has(value)) {
      pixel.clearRect(0,0,1,1);
      pixel.fillStyle = value;
      pixel.fillRect(0,0,1,1);
      const [r,g,b,a] = pixel.getImageData(0,0,1,1).data;
      colors.set(value,[r,g,b,a/255]);
    }
    return colors.get(value);
  }
  const luminance=rgb=>rgb.slice(0,3).map(c=>c/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4)
    .reduce((sum,value,i)=>sum+value*[0.2126,0.7152,0.0722][i],0);
  const failures=[];
  for(const el of [root,...root.querySelectorAll("*")]){
    if(!(el instanceof HTMLElement)||el.closest('svg,:disabled,.sr-only')||!el.getBoundingClientRect().height)continue;
    if(![...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()) && !el.matches('input:not([type="color"]),textarea'))continue;
    let bg=[255,255,255], chain=[];
    for(let e=el;e;e=e.parentElement)chain.unshift(getComputedStyle(e));
    if(chain.some(s=>s.visibility==="hidden"||s.display==="none"||Number(s.opacity)<0.9))continue;
    for(const s of chain){const [r,g,b,a=1]=color(s.backgroundColor);if(r!==undefined)bg=[r,g,b].map((c,i)=>c*a+bg[i]*(1-a));}
    const style=getComputedStyle(el), fg=color(style.color), l1=luminance(fg),l2=luminance(bg);
    const ratio=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
    if(ratio<4.49)failures.push([el.tagName,el.className,el.textContent.slice(0,32),ratio.toFixed(2)]);
  }
  return failures.slice(0,8);
}
async function run() {
  await app.whenReady();
  const win=await until(()=>BrowserWindow.getAllWindows()[0],"window");
  win.webContents.setBackgroundThrottling(false);
  const js=code=>win.webContents.executeJavaScript(code);
  const exists=s=>until(()=>js("Boolean(document.querySelector("+JSON.stringify(s)+"))"),s);
  const click=async s=>{await exists(s);await js("document.querySelector("+JSON.stringify(s)+").click()");await wait(65);};
  const key=async k=>{await js("window.dispatchEvent(new KeyboardEvent('keydown',{key:"+JSON.stringify(k)+",bubbles:true}))");await wait(40);};
  const choose=async theme=>{
    if(await js("document.documentElement.dataset.theme")===theme && nativeTheme.themeSource!==theme) await click(".window-theme-button");
    if(await js("document.documentElement.dataset.theme")!==theme) await click(".window-theme-button");
    await until(()=>js("document.documentElement.dataset.theme==="+JSON.stringify(theme)),theme);
  };
  const clickText=async(scope,title)=>{
    await js(`(()=>{const button=Array.from(document.querySelector(${JSON.stringify(scope)}).querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(title)});if(!button)throw new Error('Missing button '+${JSON.stringify(title)});button.click()})()`);
    await wait(65);
  };
  const captureDir=process.env.DRAWIC_THEME_CAPTURE_DIR;
  const issues=[], seen=[];
  async function inspect(name,scope,capture=false){
    await exists(scope);
    // Inspect the fully painted surface, including the menu/dialog entrance transition.
    await js(`Promise.all(document.querySelector(${JSON.stringify(scope)}).getAnimations({subtree:true})
      .filter(animation => animation.effect.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {}))).then(() => true)`);
    const findings=await js("("+auditText.toString()+")("+JSON.stringify(scope)+")");
    if(findings.length)issues.push([name,findings]);
    seen.push(name);
    if(capture && captureDir){fs.mkdirSync(captureDir,{recursive:true});fs.writeFileSync(path.join(captureDir,name+".png"),(await win.webContents.capturePage()).toPNG());}
  }
  async function pointer(selector,button=0) {
    await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect();
      for(const type of ['pointerdown','pointerup'])el.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,pointerId:5,pointerType:'mouse',button:${button},buttons:type==='pointerup'?0:${button===2?2:1}}));})()`);
    await wait(60);
  }
  await exists('[data-node-id="r1"]');
  win.webContents.debugger.attach();
  const emulate = value => win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
    features:[{name:"prefers-color-scheme",value}],
  });
  await js("localStorage.setItem('drawic.theme','system')");
  await win.webContents.reload();
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
  await click('[aria-label="Open"]');
  await exists('[data-node-id="r1"]');
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[incoming]});
  await emulate("light"); await until(()=>js("document.documentElement.dataset.theme==='light'"),"initial system theme");
  assert.equal(nativeTheme.themeSource,"system");
  assert.equal(await js("document.documentElement.dataset.theme"),"light");
  await emulate("dark");await until(()=>js("document.documentElement.dataset.theme==='dark'"),"system change");
  win.webContents.debugger.detach();
  const darkPaint = new Map();
  async function checkLibraryControl(theme, selector) {
    const paint = await js(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const owner = el.closest(".radix-themes");
      return [owner?.classList.contains(${JSON.stringify(theme)}), getComputedStyle(el).color];
    })()`);
    assert(paint[0], selector + " inherits " + theme);
    if (theme === "dark") darkPaint.set(selector, paint[1]);
    else assert.notEqual(paint[1], darkPaint.get(selector), selector + " changes paint");
  }
  let wirePaint;
  for(const theme of ["dark","light"]){
    await choose(theme);
    assert.equal(nativeTheme.themeSource,theme);
    win.setSize(1440,865);await wait(80);
    await inspect(theme+"-shell",".app-shell",true);
    const stroke=await js("getComputedStyle(document.querySelector('.wire-visible')).stroke");
    if(wirePaint)assert.equal(stroke,wirePaint); else wirePaint=stroke;
    await pointer('[data-node-id="r1"]',2);await inspect(theme+"-canvas-menu",".context-menu");await key("Escape");
    await pointer('[data-node-id="r1"]');await inspect(theme+"-properties",".properties-panel",true);
    await pointer('[data-shape-id="note"]');await inspect(theme+"-note-properties",".properties-panel");
    await pointer('[data-wire-id="w1"]');await inspect(theme+"-wire-properties",".properties-panel");
    await js("document.querySelector('.page-tab').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:360,clientY:180}))");
    await inspect(theme+"-page-menu",".context-menu");await key("Escape");await click(".page-add");
    await inspect(theme+"-name-dialog",".modal-card");await click(".modal-actions button");
    await click(".console-toggle");await inspect(theme+"-console",".editor-console");await click(".console-toggle");
    await js("Array.from(document.querySelectorAll('.status-bar button')).find(b=>b.textContent==='Run ERC').click()");
    await inspect(theme+"-erc",".erc-panel");await click('[aria-label="Close ERC results"]');
    await click(".page-add");await click(".modal-actions button[type=submit]");await click('[aria-label="New"]');
    await inspect(theme+"-unsaved-dialog",".unsaved-dialog");await clickText(".unsaved-dialog","Cancel");await click(".page-tab");
    await click('[aria-label="Export"]');await inspect(theme+"-export",".export-dialog",true);await click('.export-dialog [aria-label="Close"]');
    await click('.agent-trigger');await inspect(theme+"-agent",".agent-settings");await clickText(".agent-settings","Enable Agent");
    await inspect(theme+"-agent-config",".agent-settings textarea");await clickText(".agent-settings","Disable Agent");await click('.export-dialog [aria-label="Close"]');
    await click(".library-manage");await inspect(theme+"-browse",".device-library-screen",true);
    await click(".device-maintenance summary");await click(".device-maintenance button");await inspect(theme+"-audit",".pin-audit-panel");
    await click(".device-library-tabs button:last-child");await inspect(theme+"-custom",".custom-workspace",true);
    await clickText(".custom-heading","Import library…");await inspect(theme+"-import-conflict",".device-import-dialog");await clickText(".device-import-dialog","Cancel");
    await checkLibraryControl(theme, ".custom-record button");
    await checkLibraryControl(theme, ".custom-filter input");
    await js(`(() => {
      const row = document.querySelector(".custom-record"), rect = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2,
        clientX: rect.left + 220, clientY: rect.top + rect.height / 2 }));
    })()`);
    await exists(".rt-ContextMenuContent");
    await until(() => js('document.querySelector(".rt-ContextMenuContent").getBoundingClientRect().width > 0'), "menu positioned");
    await inspect(theme+"-library-menu", ".rt-ContextMenuContent", true);
    await checkLibraryControl(theme, ".rt-ContextMenuItem");
    await click('.rt-ContextMenuItem:last-child');
    await inspect(theme+"-delete-confirm","[role=alertdialog]",true);
    await checkLibraryControl(theme, "[role=alertdialog] h1, [role=alertdialog] h2");
    await clickText("[role=alertdialog]","Cancel");
    await clickText(".custom-record","Duplicate");await click('[aria-label="Close device library"]');
    await inspect(theme+"-library-unsaved","[role=alertdialog]");await clickText("[role=alertdialog]","Discard");
    await click(".library-manage");await click(".device-library-tabs button:last-child");await click(".custom-heading .custom-primary");
    await inspect(theme+"-editor",".device-editor",true);
    await js("(()=>{const el=Array.from(document.querySelectorAll('.device-editor-field')).find(l=>l.textContent.trim()==='Title').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Test draft');el.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await click(".device-draft-button");await inspect(theme+"-validation",".device-editor-errors");
    await click(".device-editor-back");await inspect(theme+"-leave-dialog",".device-editor-leave-dialog");
    await click(".device-editor-leave-dialog .modal-actions button:nth-child(2)");await click('[aria-label="Close device library"]');
    await click('[aria-label="Hide device library"]');await inspect(theme+"-collapsed",".panel-rail-left");await click('[aria-label="Show device library"]');
    await js("document.querySelector('[data-annotation-id=label]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
    await inspect(theme+"-inline-rich-text",".canvas-rich-inline-editor");await key("Escape");
    await click(".page-tab");
    win.setSize(920,660);await wait(140);
    await inspect("compact-"+theme,".app-shell",true);
    assert(await js("document.querySelector('.canvas-controls').getBoundingClientRect().right <= document.querySelector('.properties-panel').getBoundingClientRect().left"),"inspector obscures zoom controls");
  }
  await choose("light");win.setSize(920,660);await wait(160);
  await win.webContents.reload();
  await until(()=>js("document.documentElement.dataset.theme==='light'"),"persisted preference");
  assert(await js("!document.querySelector('.appearance-mode')"),"redundant appearance selector");
  assert(await js("document.documentElement.scrollWidth===innerWidth"),"window overflow");
  assert.deepEqual(issues,[], "Low contrast: "+JSON.stringify(issues));
  console.log("Verified "+seen.length+" surfaces; System followed the OS; document wire paint was stable.");
}
run().then(()=>app.exit(0),err=>{console.error(err);app.exit(1)});
