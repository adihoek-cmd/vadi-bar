let BASE=null;
let USER={inventory:null,cocktails:[]};
let CURRENT=null;
let INV_CAT='spirit';

const $=id=>document.getElementById(id);
const normalize=s=>(s||"").toLowerCase();

function slugify(name){return (name||"").toLowerCase().trim().replace(/['"]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");}
function fmtAmt(x){if(x===undefined||x===null) return ""; if(typeof x==="number") return `${x} ml`; return `${x}`;}

function loadUser(){
  try{
    USER.inventory = JSON.parse(localStorage.getItem("vadi.user.inventory")||"null");
    USER.cocktails = JSON.parse(localStorage.getItem("vadi.user.cocktails")||"[]");
  }catch(e){ USER.inventory=null; USER.cocktails=[]; }
  migrateInventoryIfNeeded();
}
function saveUser(){
  localStorage.setItem("vadi.user.inventory", JSON.stringify(USER.inventory));
  localStorage.setItem("vadi.user.cocktails", JSON.stringify(USER.cocktails));
}

// v3 -> v4 migration
function migrateInventoryIfNeeded(){
  if(!USER.inventory) return;
  if(USER.inventory.items) return;
  const old = USER.inventory;
  const items=[];
  const pushGroup=(group, category)=>{
    (old[group]||[]).forEach(x=>items.push({category, kind:x.name, label:x.name, have:!!x.have}));
  };
  pushGroup("spirits","spirit");
  pushGroup("modifiers","modifier");
  pushGroup("syrups","syrup");
  pushGroup("pantry","pantry");
  USER.inventory = {items};
  saveUser();
}

function mergedInventory(){
  const out = JSON.parse(JSON.stringify(BASE.inventory));
  if(!USER.inventory) return out;
  const key = (it)=>`${it.category}||${it.kind}||${it.label}`;
  const map = new Map((out.items||[]).map(it=>[key(it), it]));
  (USER.inventory.items||[]).forEach(it=>map.set(key(it), it));
  out.items = Array.from(map.values());
  return out;
}

function allCocktails(){
  const byId = new Map((BASE.cocktails||[]).map(c=>[c.id,c]));
  (USER.cocktails||[]).forEach(c=>byId.set(c.id,c));
  return Array.from(byId.values());
}

function haveKinds(inv){
  const set = new Set();
  (inv.items||[]).forEach(it=>{ if(it.have) set.add(it.kind); });
  return set;
}

function computeMakeability(c, inv){
  const have = haveKinds(inv);
  const missing=[];
  (c.ingredients||[]).forEach(i=>{
    const k=i.requires;
    if(k && !have.has(k)) missing.push(k);
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
  $("foot").textContent=`Loaded ${allCocktails().length} cocktails · Showing ${list.length}`;
  document.querySelectorAll(".card").forEach(el=>el.addEventListener("click",()=>openDlg(el.getAttribute("data-id"))));
}

function ensureUserInv(){
  if(!USER.inventory) USER.inventory={items:[]};
  if(!USER.inventory.items) USER.inventory.items=[];
}

function setItemHave(category, kind, label, have){
  ensureUserInv();
  const items = USER.inventory.items;
  const idx = items.findIndex(it=>it.category===category && it.kind===kind && it.label===label);
  if(idx>=0) items[idx].have = have;
  else items.push({category,kind,label,have});
  saveUser();
}

function renderInventory(){
  const inv=mergedInventory();
  const items=(inv.items||[]).slice();

  // Category tabs (top level)
  const cats=[
    {k:"spirit", label:"Spirits"},
    {k:"modifier", label:"Modifiers"},
    {k:"syrup", label:"Syrups"},
    {k:"pantry", label:"Pantry"},
  ];
  $("inv-cattabs").innerHTML = cats.map(c=>`<div class="chip" data-cat="${c.k}" aria-pressed="${INV_CAT===c.k}">${c.label}</div>`).join("");
  document.querySelectorAll("#inv-cattabs .chip").forEach(ch=>{
    ch.addEventListener("click",()=>{
      INV_CAT = ch.getAttribute("data-cat");
      renderInventory();
    });
  });

  // Grouping rules (by kind), with special: all rum kinds -> "Rum"
  const norm = s => (s||"").toLowerCase();
  const groupOf = (kind)=>{
    if(norm(kind).includes("rum")) return "Rum";
    return kind;
  };

  const catItems = items.filter(it=>it.category===INV_CAT);
  const byGroup = new Map();
  for(const it of catItems){
    const g = groupOf(it.kind);
    if(!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(it);
  }
  const groups = Array.from(byGroup.keys()).sort((a,b)=>a.localeCompare(b));

  // Restore open/closed state
  const openKey = `vadi.inv.open.${INV_CAT}`;
  const openGroups = new Set(JSON.parse(localStorage.getItem(openKey) || "[]"));

  // For Rum group: list of existing rum kinds to pick from
  const rumKinds = [...new Set(catItems.filter(it=>groupOf(it.kind)==="Rum").map(it=>it.kind))].sort((a,b)=>a.localeCompare(b));

  const accordions = groups.map(group=>{
    const list = (byGroup.get(group)||[]).slice().sort((a,b)=>a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
    const haveCount = list.filter(x=>x.have).length;
    const isOpen = openGroups.has(group);

    const rows = list.map(it=>`
      <div class="card" style="margin-top:10px">
        <div class="itemrow">
          <div>
            <div><b>${it.label}</b></div>
            <div class="small">${it.kind}</div>
          </div>
          <div class="switch">
            <input type="checkbox" ${it.have?"checked":""} data-cat="${it.category}" data-kind="${it.kind}" data-label="${it.label}">
          </div>
        </div>
      </div>
    `).join("");

    const isRum = (group==="Rum");

    const kindPicker = isRum ? `
      <select class="miniSelect inv-add-kind" data-group="${group}">
        ${rumKinds.map(k=>`<option value="${k}">${k}</option>`).join("")}
        <option value="__custom__">Other…</option>
      </select>
      <input type="text" class="miniInput inv-add-kind-custom" data-group="${group}" placeholder="Type (kind) e.g. White rum" style="display:none;min-width:180px">
    ` : `<input type="hidden" class="inv-add-kind" data-group="${group}" value="${group}">`;

    return `
      <details class="acc" data-group="${group}" ${isOpen?"open":""}>
        <summary>
          <div>
            <div class="title">${(group||"").toUpperCase()}</div>
            <div class="accCount">${haveCount}/${list.length} available</div>
          </div>
          <div class="badge">${group}</div>
        </summary>
        <div class="accBody">
          ${rows || `<div class="small">No bottles yet.</div>`}
          <div class="accAdd">
            <div class="small"><b>Add a new bottle</b> (${group})</div>
            <div class="inlineRow" style="margin-top:8px">
              ${kindPicker}
              <input type="text" class="inv-add-label" data-group="${group}" placeholder="Bottle name (brand / label)" style="flex:1;min-width:220px">
              <button class="btn primary inv-add-btn" data-group="${group}">Add</button>
              <button class="btn inv-scan-btn" data-group="${group}">Scan</button>
            </div>
            <div class="small inv-add-msg" data-group="${group}" style="margin-top:6px"></div>
          </div>
        </div>
      </details>
    `;
  }).join("");

  $("inv-accordions").innerHTML = accordions || `<div class="card"><div class="title">No items</div><div class="small">Add items below.</div></div>`;

  // Save open/closed state
  document.querySelectorAll("details.acc").forEach(det=>{
    det.addEventListener("toggle",()=>{
      const g = det.getAttribute("data-group");
      const set = new Set(JSON.parse(localStorage.getItem(openKey) || "[]"));
      det.open ? set.add(g) : set.delete(g);
      localStorage.setItem(openKey, JSON.stringify([...set]));
    });
  });

  // Rum kind picker custom toggle
  document.querySelectorAll(".inv-add-kind[data-group='Rum']").forEach(sel=>{
    sel.addEventListener("change",()=>{
      const custom = document.querySelector(".inv-add-kind-custom[data-group='Rum']");
      if(!custom) return;
      custom.style.display = (sel.value==="__custom__") ? "inline-block" : "none";
      if(sel.value!=="__custom__") custom.value="";
    });
  });

  // Toggle handlers
  document.querySelectorAll('#inv-accordions input[type="checkbox"][data-cat]').forEach(cb=>{
    cb.addEventListener("change",()=>{
      setItemHave(cb.getAttribute("data-cat"), cb.getAttribute("data-kind"), cb.getAttribute("data-label"), cb.checked);
      renderCocktails();
      renderInventory(); // refresh counts
    });
  });

  // Per-group add handlers
  document.querySelectorAll(".inv-add-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const group = btn.getAttribute("data-group");
      const input = document.querySelector(`.inv-add-label[data-group="${CSS.escape(group)}"]`);
      const msg = document.querySelector(`.inv-add-msg[data-group="${CSS.escape(group)}"]`);
      const label = (input?.value||"").trim();
      if(!label){ msg.textContent="Enter a bottle name."; return; }

      // Determine kind
      let kind = group;
      if(group==="Rum"){
        const sel = document.querySelector(`.inv-add-kind[data-group="Rum"]`);
        const custom = document.querySelector(`.inv-add-kind-custom[data-group="Rum"]`);
        if(sel && sel.value==="__custom__"){
          kind = (custom?.value||"").trim() || "Rum";
        }else if(sel){
          kind = sel.value;
        }
      }

      ensureUserInv();
      USER.inventory.items.push({category:INV_CAT, kind, label, have:true});
      saveUser();
      input.value="";
      msg.textContent=`Added: ${label}`;
      renderInventory(); renderCocktails();
    });
  });

  // Per-group scan handlers
  document.querySelectorAll(".inv-scan-btn").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      const group = btn.getAttribute("data-group");
      const input = document.querySelector(`.inv-add-label[data-group="${CSS.escape(group)}"]`);
      const msg = document.querySelector(`.inv-add-msg[data-group="${CSS.escape(group)}"]`);
      await scanBarcodeToInput(input, msg);
    });
  });

  // Keep the global "Add new item" form category synced (still exists below)
  const catSel = $("add-cat");
  if(catSel && catSel.value !== INV_CAT) catSel.value = INV_CAT;

  // Hide legacy flat list container if present
  if($("invlist")) $("invlist").innerHTML = "";
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
  const items=[...(CURRENT.ingredients||[]).map(i=>`Measure: ${i.item} (${fmtAmt(i.amount_ml ?? i.amount)})`),
               ...(CURRENT.steps||[]).map(s=>`Step: ${s}`),
               `Garnish: ${CURRENT.garnish||"—"}`];
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
  ["r-name","r-garnish","r-source","r-url","r-notes","r-ings","r-steps"].forEach(id=>$(id).value="");
  $("r-glass").value="rocks"; $("r-method").value="stir"; $("r-liked").value="true"; $("r-house").value="false";
  $("r-msg").textContent="";
}

function addInventoryItem(){
  const cat=$("add-cat").value;
  const kind=$("add-kind").value.trim();
  const label=$("add-label").value.trim() || kind;
  const msg = targetMsg || $("add-msg");
  if(!kind){ msg.textContent="Kind is required (must match cocktails)."; return; }
  ensureUserInv();
  USER.inventory.items.push({category:cat, kind, label, have:true});
  saveUser();
  $("add-kind").value=""; $("add-label").value="";
  msg.textContent=`Added: ${label}`;
  renderInventory(); renderCocktails();
}

async function scanBarcodeToInput(targetInput, targetMsg){
  const msg = targetMsg || $("add-msg");
  msg.textContent="";
  if(!("BarcodeDetector" in window)){ msg.textContent="Barcode scanning not supported on this browser/device."; return; }
  const detector=new BarcodeDetector({formats:["ean_13","ean_8","code_128","qr_code","upc_a","upc_e"]});
  const dlg=document.createElement("dialog");
  dlg.style.border="none"; dlg.style.borderRadius="18px"; dlg.style.padding="0"; dlg.style.background="#141414"; dlg.style.width="min(720px,92vw)";
  dlg.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 12px 0;color:#f2f2f2">
      <div style="font-weight:800">Scan barcode</div><button id="x" class="btn">Close</button></div>
      <div style="padding:12px"><video id="v" autoplay playsinline style="width:100%;border-radius:14px;border:1px solid #2a2a2a"></video>
      <div class="small" style="margin-top:8px">Point the camera at a barcode. It will fill the label field.</div></div>`;
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
            if(targetInput){ targetInput.value=code; } else { $("add-label").value=code; }
            msg.textContent=`Scanned: ${code} (edit to actual bottle name)`;
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


async function scanBarcode(){
  return scanBarcodeToInput($("add-label"), $("add-msg"));
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
      migrateInventoryIfNeeded();
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
  try{
    const resp = await fetch("./data/vadi-bar.json", {cache:"no-cache"});
    if(!resp.ok) throw new Error("HTTP "+resp.status);
    BASE = await resp.json();
  }catch(e){
    BASE = {inventory:{items:[]}, cocktails:[]};
    const msg = "Could not load base data (data/vadi-bar.json). This is usually a GitHub Pages path/cache issue. Open the site in Chrome (not the installed icon), clear site storage, and reload.";
    alert(msg);
  }
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

$("btn-add-item").addEventListener("click",()=>addInventoryItem());
$("btn-scan").addEventListener("click",()=>scanBarcode());

$("btn-export").addEventListener("click",()=>exportJSON());
$("btn-import").addEventListener("click",()=>$("file-import").click());
$("file-import").addEventListener("change",(e)=>{ const file=e.target.files?.[0]; if(file) importJSON(file); });

$("r-save").addEventListener("click",()=>addRecipeFromForm());
$("r-clear").addEventListener("click",()=>clearRecipeForm());


$("btn-reset-inv").addEventListener("click",()=>{
  if(!confirm("This will clear ONLY this device's inventory toggles/items (recipes stay). Continue?")) return;
  localStorage.removeItem("vadi.user.inventory");
  USER.inventory=null;
  renderInventory(); renderCocktails();
  alert("Inventory reset. You should now see per-bottle items from the base list.");
});

$("btn-restore-inv").addEventListener("click",()=>{
  if(!BASE || !BASE.inventory || !Array.isArray(BASE.inventory.items)){
    alert("Base inventory failed to load. Refresh the page (and clear site storage) then try again.");
    return;
  }
  if(!confirm("This will overwrite this device's inventory list with the default bottles (and set them ON). Continue?")) return;
  USER.inventory = {items: BASE.inventory.items.map(it=>({category:it.category, kind:it.kind, label:it.label, have:true}))};
  saveUser();
  renderInventory(); renderCocktails();
  alert("Restored default inventory.");
});


init();