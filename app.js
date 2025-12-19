let BASE=null;
let USER={inventory:null,cocktails:[]};
let CURRENT=null;

const $=id=>document.getElementById(id);
const normalize=s=>(s||"").toLowerCase();

function slugify(name){
  return (name||"").toLowerCase().trim().replace(/['"]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
}
function fmtAmt(x){ if(x===undefined||x===null) return ""; if(typeof x==="number") return `${x} ml`; return `${x}`; }

function glassSVG(kind){
  const common=`class="svgglass" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"`;
  if(kind==="coupe") return `<svg ${common}><path d="M14 10h36c0 14-9 23-18 23S14 24 14 10Z" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M32 33v13" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M22 58h20" stroke="white" stroke-opacity=".7" stroke-width="3"/></svg>`;
  if(kind==="mug") return `<svg ${common}><path d="M18 18h26v30H18V18Z" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M44 24h6c4 0 6 3 6 7s-2 7-6 7h-6" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M20 52h22" stroke="white" stroke-opacity=".7" stroke-width="3"/></svg>`;
  return `<svg ${common}><path d="M18 20h28l-4 32H22l-4-32Z" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M22 28h20" stroke="white" stroke-opacity=".25" stroke-width="3"/><path d="M24 34h16" stroke="white" stroke-opacity=".25" stroke-width="3"/></svg>`;
}

function loadUser(){
  try{
    USER.inventory = JSON.parse(localStorage.getItem("vadi.user.inventory")||"null");
    USER.cocktails = JSON.parse(localStorage.getItem("vadi.user.cocktails")||"[]");
  }catch(e){
    USER.inventory=null; USER.cocktails=[];
  }
}
function saveUser(){
  localStorage.setItem("vadi.user.inventory", JSON.stringify(USER.inventory));
  localStorage.setItem("vadi.user.cocktails", JSON.stringify(USER.cocktails));
}

function mergedInventory(){
  const out = JSON.parse(JSON.stringify(BASE.inventory));
  if(!USER.inventory) return out;
  const u = USER.inventory;
  for(const group of ["spirits","modifiers","syrups","pantry"]){
    const baseItems = out[group] || [];
    const byName = new Map(baseItems.map(x=>[x.name,x]));
    (u[group]||[]).forEach(ui=>{
      if(byName.has(ui.name)){
        const bi = byName.get(ui.name);
        bi.have = ui.have;
        if(ui.examples) bi.examples = ui.examples;
        if(ui.homemade) bi.homemade = ui.homemade;
      }else{
        baseItems.push(ui);
      }
    });
    out[group]=baseItems;
  }
  return out;
}

function allCocktails(){
  const byId = new Map((BASE.cocktails||[]).map(c=>[c.id,c]));
  (USER.cocktails||[]).forEach(c=>byId.set(c.id,c));
  return Array.from(byId.values());
}

function inventoryHaveSet(inv){
  const set = new Set();
  for(const group of ["spirits","modifiers","syrups","pantry"]){
    (inv[group]||[]).forEach(x=>{ if(x.have) set.add(x.name); });
  }
  return set;
}

function computeMakeability(c, inv){
  const have = inventoryHaveSet(inv);
  const missing=[];
  (c.ingredients||[]).forEach(i=>{
    const key=i.requires;
    if(key && !have.has(key)) missing.push(key);
  });
  return {canMake: missing.length===0, missing:[...new Set(missing)]};
}

function cocktailText(c){
  const ing=(c.ingredients||[]).map(i=>`${i.item} ${fmtAmt(i.amount_ml ?? i.amount)} ${i.requires||""}`).join(" ");
  return `${c.name} ${c.method} ${c.glass} ${ing} ${c.garnish||""}`.toLowerCase();
}

function chipToggle(chip){
  const pressed = chip.getAttribute("aria-pressed")==="true";
  chip.setAttribute("aria-pressed", pressed ? "false":"true");
  renderCocktails();
}

function badgeHTML(c, inv){
  const mk=computeMakeability(c,inv);
  const out=[];
  if(c.liked) out.push(`<span class="badge liked">★ Liked</span>`);
  if(c.house) out.push(`<span class="badge">House</span>`);
  out.push(`<span class="badge method">${(c.method||"").toUpperCase()}</span>`);
  out.push(mk.canMake ? `<span class="badge ok">Can make</span>` : `<span class="badge missing">Missing</span>`);
  return out.join(" ");
}

function cardHTML(c, inv){
  return `<div class="card" data-id="${c.id}">
    <div class="row">
      <div>
        <div class="title">${c.name}</div>
        <div class="meta">${(c.glass||"").toUpperCase()} · ${c.source||""}</div>
      </div>
      <div>${glassSVG(c.glass)}</div>
    </div>
    <div class="badges">${badgeHTML(c,inv)}</div>
    <hr>
    <div class="small"><b>Build</b>: ${(c.method||"").replace("+"," + ")}</div>
    <div class="small"><b>Garnish</b>: ${c.garnish || "—"}</div>
  </div>`;
}

function passesFilters(c, inv){
  const q=normalize($("q").value.trim());
  if(q && !cocktailText(c).includes(q)) return false;
  if($("chip-liked").getAttribute("aria-pressed")==="true" && !c.liked) return false;
  if($("chip-house").getAttribute("aria-pressed")==="true" && !c.house) return false;
  if($("chip-canmake").getAttribute("aria-pressed")==="true" && !computeMakeability(c,inv).canMake) return false;
  if($("chip-stir").getAttribute("aria-pressed")==="true" && !(c.method||"").includes("stir")) return false;
  if($("chip-shake").getAttribute("aria-pressed")==="true" && !(c.method||"").includes("shake")) return false;
  return true;
}

function renderCocktails(){
  const inv=mergedInventory();
  const list=allCocktails().filter(c=>passesFilters(c,inv));
  $("grid").innerHTML=list.map(c=>cardHTML(c,inv)).join("");
  $("foot").textContent=`Loaded ${allCocktails().length} cocktails · Showing ${list.length} · Device edits saved locally`;
  document.querySelectorAll(".card").forEach(el=>el.addEventListener("click",()=>openDlg(el.getAttribute("data-id"))));
}

function setInventoryHave(group, name, have){
  if(!USER.inventory) USER.inventory={spirits:[],modifiers:[],syrups:[],pantry:[]};
  const arr = USER.inventory[group] || (USER.inventory[group]=[]);
  const idx = arr.findIndex(x=>x.name===name);
  if(idx>=0) arr[idx].have=have;
  else arr.push({name,have});
  saveUser();
}

function renderInventory(){
  const inv=mergedInventory();
  const sections=[["Spirits","spirits"],["Modifiers","modifiers"],["Syrups","syrups"],["Pantry","pantry"]];
  $("invgrid").innerHTML=sections.map(([title,key])=>{
    const items=inv[key]||[];
    const rows=items.map(it=>{
      const ex=it.examples?`<div class="small">${it.examples.join(" · ")}</div>`:"";
      const hm=it.homemade?`<div class="small">Homemade</div>`:"";
      return `<div class="item">
        <div><div><b>${it.name}</b></div>${ex}${hm}</div>
        <div class="switch"><input type="checkbox" ${it.have?"checked":""} data-invkey="${key}" data-name="${it.name}"></div>
      </div>`;
    }).join('<div style="height:10px"></div>');
    return `<div class="card"><div class="title">${title}</div><hr>${rows}</div>`;
  }).join("");

  document.querySelectorAll('input[type="checkbox"][data-invkey]').forEach(cb=>{
    cb.addEventListener("change",()=>{
      setInventoryHave(cb.getAttribute("data-invkey"), cb.getAttribute("data-name"), cb.checked);
      renderCocktails();
    });
  });
}

const MOODS={
  bitter:c=>["negroni"].includes(c.id),
  strong:c=>["vieux-carre","monte-carlo","rusty-nail","bb"].includes(c.id),
  smoky:c=>["penicillin"].includes(c.id),
  fresh:c=>["sidecar","margarita"].includes(c.id),
  sweet:c=>["rusty-nail","bb","maple-old-fashioned"].includes(c.id),
};

function renderChoice(mood){
  const inv=mergedInventory();
  const list=allCocktails().filter(c=>MOODS[mood]?.(c));
  $("choicegrid").innerHTML=list.map(c=>cardHTML(c,inv)).join("");
  document.querySelectorAll("#choicegrid .card").forEach(el=>el.addEventListener("click",()=>openDlg(el.getAttribute("data-id"))));
}

function openDlg(id){
  const inv=mergedInventory();
  const c=allCocktails().find(x=>x.id===id);
  if(!c) return;
  CURRENT=c;
  const mk=computeMakeability(c,inv);

  $("dlg-title").textContent=c.name;
  $("dlg-meta").textContent=`${(c.glass||"").toUpperCase()} · ${c.source||""}`;
  $("dlg-glass").innerHTML=glassSVG(c.glass);

  const kv=[];
  if(c.liked) kv.push(`<span class="badge liked">★ Liked</span>`);
  if(c.house) kv.push(`<span class="badge">House Menu</span>`);
  kv.push(`<span class="badge method">${(c.method||"").toUpperCase()}</span>`);
  kv.push(mk.canMake?`<span class="badge ok">Can make</span>`:`<span class="badge missing">Missing: ${mk.missing.join(", ")}</span>`);
  $("dlg-kv").innerHTML=kv.join(" ");

  $("dlg-ing").innerHTML=(c.ingredients||[]).map(i=>`<li>${i.item} — ${fmtAmt(i.amount_ml ?? i.amount)}</li>`).join("");
  $("dlg-missing").innerHTML=mk.canMake?"":`<b>Missing:</b> ${mk.missing.join(", ")}`;
  $("dlg-steps").innerHTML=(c.steps||[]).map(s=>`<li>${s}</li>`).join("");
  $("dlg-garnish").innerHTML=`<b>Garnish:</b> ${c.garnish||"—"}`;
  $("dlg-notes").innerHTML=c.notes?`<b>Note:</b> ${c.notes}`:"";

  const a=$("dlg-src");
  a.href=c.source_url||"#";
  a.textContent=c.source_url?(c.source||"Source"):"—";

  const isUser=(USER.cocktails||[]).some(x=>x.id===c.id);
  $("btn-del").disabled=!isUser;

  $("makebox").style.display="none";
  $("checklist").innerHTML="";
  $("dlg").showModal();
}

function startMakeMode(){
  if(!CURRENT) return;
  const key=`checks:${CURRENT.id}`;
  const saved=JSON.parse(localStorage.getItem(key)||"[]");
  const items=[
    ...(CURRENT.ingredients||[]).map(i=>`Measure: ${i.item} (${fmtAmt(i.amount_ml ?? i.amount)})`),
    ...(CURRENT.steps||[]).map(s=>`Step: ${s}`),
    `Garnish: ${CURRENT.garnish||"—"}`
  ];
  $("makebox").style.display="block";
  const box=$("checklist"); box.innerHTML="";
  items.forEach((label,idx)=>{
    const row=document.createElement("label");
    row.style.display="flex"; row.style.gap="10px"; row.style.alignItems="flex-start"; row.style.margin="8px 0";
    const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=saved.includes(idx);
    cb.addEventListener("change",()=>{
      const set=new Set(JSON.parse(localStorage.getItem(key)||"[]"));
      cb.checked?set.add(idx):set.delete(idx);
      localStorage.setItem(key, JSON.stringify([...set]));
    });
    const span=document.createElement("span"); span.textContent=label;
    row.appendChild(cb); row.appendChild(span);
    box.appendChild(row);
  });
}

function resetChecks(){
  if(!CURRENT) return;
  localStorage.removeItem(`checks:${CURRENT.id}`);
  if($("makebox").style.display!=="none") startMakeMode();
}

function deleteCurrentIfUser(){
  if(!CURRENT) return;
  const idx=(USER.cocktails||[]).findIndex(x=>x.id===CURRENT.id);
  if(idx<0) return;
  USER.cocktails.splice(idx,1);
  saveUser();
  $("dlg").close();
  renderCocktails();
}

function setView(which){
  const views={cocktails:$("view-cocktails"),inventory:$("view-inventory"),choice:$("view-choice"),add:$("view-add")};
  Object.values(views).forEach(v=>v.style.display="none");
  views[which].style.display="block";
  $("controls").style.display=(which==="cocktails")?"flex":"none";
  document.querySelectorAll(".navbtn").forEach(b=>b.classList.remove("active"));
  $(`nav-${which}`).classList.add("active");
  if(which==="cocktails") renderCocktails();
  if(which==="inventory") renderInventory();
}

function parseIngredients(text){
  const lines=(text||"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const out=[];
  for(const line of lines){
    const parts=line.split("|").map(x=>x.trim());
    const [item,amt,req]=parts;
    if(!item) continue;
    const obj={item};
    const num=Number(amt);
    if(amt && !Number.isNaN(num) && /^\d+(\.\d+)?$/.test(amt)) obj.amount_ml=num;
    else if(amt) obj.amount=amt;
    if(req) obj.requires=req;
    out.push(obj);
  }
  return out;
}
function parseSteps(text){ return (text||"").split(/\r?\n/).map(l=>l.trim()).filter(Boolean); }

function addRecipeFromForm(){
  const name=$("r-name").value.trim();
  if(!name){ $("r-msg").textContent="Name is required."; return; }
  const id=slugify(name);
  const cocktail={
    id,name,
    liked:$("r-liked").value==="true",
    house:$("r-house").value==="true",
    glass:$("r-glass").value,
    method:$("r-method").value,
    garnish:$("r-garnish").value.trim()||"—",
    source:$("r-source").value.trim()||"User",
    source_url:$("r-url").value.trim()||"",
    notes:$("r-notes").value.trim()||"",
    ingredients:parseIngredients($("r-ings").value),
    steps:parseSteps($("r-steps").value)
  };
  if(cocktail.ingredients.length===0 || cocktail.steps.length===0){
    $("r-msg").textContent="Please add at least 1 ingredient and 1 step.";
    return;
  }
  const idx=(USER.cocktails||[]).findIndex(x=>x.id===id);
  if(idx>=0) USER.cocktails[idx]=cocktail; else USER.cocktails.push(cocktail);
  saveUser();
  $("r-msg").textContent=`Saved: ${name}`;
  renderCocktails();
}

function clearRecipeForm(){
  ["r-name","r-garnish","r-source","r-url","r-notes"].forEach(id=>$(id).value="");
  $("r-glass").value="rocks"; $("r-method").value="stir"; $("r-liked").value="true"; $("r-house").value="false";
  $("r-ings").value=""; $("r-steps").value=""; $("r-msg").textContent="";
}

function addInventoryItem(){
  const name=$("inv-name").value.trim();
  const cat=$("inv-cat").value;
  const msg=$("inv-scan-msg");
  if(!name){ msg.textContent="Enter an item name."; return; }
  if(!USER.inventory) USER.inventory={spirits:[],modifiers:[],syrups:[],pantry:[]};
  const arr=USER.inventory[cat] || (USER.inventory[cat]=[]);
  if(!arr.some(x=>x.name===name)) arr.push({name,have:true});
  saveUser();
  $("inv-name").value="";
  msg.textContent=`Added: ${name}`;
  renderInventory(); renderCocktails();
}

async function scanBarcode(){
  const msg=$("inv-scan-msg");
  msg.textContent="";
  if(!("BarcodeDetector" in window)){ msg.textContent="Barcode scanning not supported on this browser/device."; return; }
  const detector=new BarcodeDetector({formats:["ean_13","ean_8","code_128","qr_code","upc_a","upc_e"]});
  const dlg=document.createElement("dialog");
  dlg.style.border="none"; dlg.style.borderRadius="18px"; dlg.style.padding="0"; dlg.style.background="#141414"; dlg.style.width="min(720px,92vw)";
  dlg.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 12px 0;color:#f2f2f2">
      <div style="font-weight:800">Scan barcode</div><button id="x" class="btn">Close</button></div>
      <div style="padding:12px"><video id="v" autoplay playsinline style="width:100%;border-radius:14px;border:1px solid #2a2a2a"></video>
      <div class="small" style="margin-top:8px">Point the camera at a barcode. It will fill the item field.</div></div>`;
  document.body.appendChild(dlg); dlg.showModal();
  let stream=null, raf=null;
  const video=dlg.querySelector("#v");
  const close=async()=>{ if(raf) cancelAnimationFrame(raf); if(stream) stream.getTracks().forEach(t=>t.stop()); dlg.close(); dlg.remove(); };
  dlg.querySelector("#x").addEventListener("click", close);
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
    video.srcObject=stream; await video.play();
    const canvas=document.createElement("canvas");
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    const tick=async()=>{
      if(video.readyState>=2){
        canvas.width=video.videoWidth; canvas.height=video.videoHeight;
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        try{
          const bitmap=await createImageBitmap(canvas);
          const codes=await detector.detect(bitmap);
          if(codes && codes.length){
            const code=codes[0].rawValue||"";
            $("inv-name").value=code;
            msg.textContent=`Scanned: ${code} (edit to actual bottle/item name if you want)`;
            await close(); return;
          }
        }catch(e){}
      }
      raf=requestAnimationFrame(tick);
    };
    tick();
  }catch(e){
    msg.textContent="Could not access camera. Check permissions.";
    await close();
  }
}

function exportJSON(){
  const payload={user_inventory:USER.inventory, user_cocktails:USER.cocktails};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="vadi-bar-backup.json"; a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const payload=JSON.parse(reader.result);
      USER.inventory=payload.user_inventory || USER.inventory;
      USER.cocktails=payload.user_cocktails || USER.cocktails;
      saveUser();
      renderInventory(); renderCocktails();
      alert("Imported successfully.");
    }catch(e){ alert("Import failed: invalid JSON."); }
  };
  reader.readAsText(file);
}

function registerSW(){
  if("serviceWorker" in navigator){
    window.addEventListener("load",()=>{ navigator.serviceWorker.register("./sw.js").catch(()=>{}); });
  }
}

async function loadBase(){
  const resp=await fetch("./data/vadi-bar.json");
  BASE=await resp.json();
}

async function init(){
  loadUser();
  await loadBase();
  renderCocktails();
  registerSW();
}

$("chip-liked").addEventListener("click",()=>chipToggle($("chip-liked")));
$("chip-house").addEventListener("click",()=>chipToggle($("chip-house")));
$("chip-canmake").addEventListener("click",()=>chipToggle($("chip-canmake")));
$("chip-stir").addEventListener("click",()=>chipToggle($("chip-stir")));
$("chip-shake").addEventListener("click",()=>chipToggle($("chip-shake")));
$("q").addEventListener("input",()=>renderCocktails());

$("dlg-close").addEventListener("click",()=>$("dlg").close());
$("btn-make").addEventListener("click",()=>startMakeMode());
$("btn-reset").addEventListener("click",()=>resetChecks());
$("btn-del").addEventListener("click",()=>deleteCurrentIfUser());

$("nav-cocktails").addEventListener("click",()=>setView("cocktails"));
$("nav-inventory").addEventListener("click",()=>setView("inventory"));
$("nav-choice").addEventListener("click",()=>setView("choice"));
$("nav-add").addEventListener("click",()=>setView("add"));

document.querySelectorAll("[data-mood]").forEach(btn=>btn.addEventListener("click",()=>renderChoice(btn.getAttribute("data-mood"))));

$("inv-add").addEventListener("click",()=>addInventoryItem());
$("inv-scan").addEventListener("click",()=>scanBarcode());

$("btn-export").addEventListener("click",()=>exportJSON());
$("btn-import").addEventListener("click",()=>$("file-import").click());
$("file-import").addEventListener("change",(e)=>{ const file=e.target.files?.[0]; if(file) importJSON(file); });

$("r-save").addEventListener("click",()=>addRecipeFromForm());
$("r-clear").addEventListener("click",()=>clearRecipeForm());

init();