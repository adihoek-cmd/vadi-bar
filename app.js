let BASE=null;
let USER={inventory:null,cocktails:[]};
let CURRENT=null;
let INV_CAT='spirit';
let INV_MISSING_ONLY=false;

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
  initLinkImporter();
  initCocktailAdd();
  initWheel();
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
        <div class="cocktailHeader"><div class="title">${c.name}</div><div class="glassIcon" title="${c.glass||""}">${glassEmoji(c.glass)}</div></div>
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
  initWebSuggest();
    });
  });

  // Missing filter chips
  if($("inv-filter")){
    $("inv-filter").innerHTML = [
      `<div class="chip" data-miss="0" aria-pressed="${!INV_MISSING_ONLY}">All</div>`,
      `<div class="chip" data-miss="1" aria-pressed="${INV_MISSING_ONLY}">Missing</div>`,
      `<button class="btn" id="btn-copy-missing" style="margin-left:auto">Copy missing list</button>`
    ].join("");
    document.querySelectorAll("#inv-filter .chip").forEach(ch=>{
      ch.addEventListener("click",()=>{
        INV_MISSING_ONLY = ch.getAttribute("data-miss")==="1";
        renderInventory();
  initWebSuggest();
      });
    });
    $("btn-copy-missing").addEventListener("click",async()=>{
      const invNow = mergedInventory();
      const miss = (invNow.items||[]).filter(it=>it.category===INV_CAT && !it.have).map(it=>`${it.kind} — ${it.label}`);
      const txt = miss.length ? miss.join("\n") : "Nothing missing.";
      try{ await navigator.clipboard.writeText(txt); alert("Copied."); }catch(e){ alert(txt); }
    });
  }


  // Grouping rules (by kind), with special: all rum kinds -> "Rum"
  const norm = s => (s||"").toLowerCase();
  const groupOf = (kind)=>{
    if(norm(kind).includes("rum")) return "Rum";
    return kind;
  };

  const catItems = items.filter(it=>it.category===INV_CAT).filter(it=>INV_MISSING_ONLY ? !it.have : true);
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
  initLinkImporter();
  initCocktailAdd();
  initWheel();
      renderInventory();
  initWebSuggest(); // refresh counts
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
      renderInventory();
  initWebSuggest(); renderCocktails();
  initLinkImporter();
  initCocktailAdd();
  initWheel();
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
  initLinkImporter();
  initCocktailAdd();
  initWheel();
}

function setView(which){
  const views={cocktails:$("view-cocktails"),inventory:$("view-inventory"),wheel:$("view-wheel"),choice:$("view-choice")};
  Object.values(views).forEach(v=>v.style.display="none");
  if(!views[which]) which="cocktails";
  views[which].style.display="block";
  $("controls").style.display=(which==="cocktails")?"flex":"none";
  document.querySelectorAll(".navbtn").forEach(b=>b.classList.remove("active"));
  $(`nav-${which}`).classList.add("active");
  if(which==="cocktails") { renderCocktails();
  initLinkImporter(); initLinkImporter(); }
  initCocktailAdd();
  initWheel();
  if(which==="inventory") renderInventory();
  initWebSuggest();
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
  initLinkImporter();
  initCocktailAdd();
  initWheel();
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
  renderInventory();
  initWebSuggest(); renderCocktails();
  initLinkImporter();
  initCocktailAdd();
  initWheel();
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
  const info = await lookupBarcodeOnline(code);
  if(info){
    const guessText = `${info.name} ${info.brands} ${info.categories}`.trim();
    const kindGuess = inferKindFromText(guessText) || inferKindFromText(info.categories) || null;
    const labelGuess = (info.name || info.brands || code).trim();
    if(targetInput){ targetInput.value = labelGuess; } else { $("add-label").value = labelGuess; }
    if(kindGuess){
      const kindEl = $("add-kind"); const catEl = $("add-cat");
      if(kindEl) kindEl.value = kindGuess;
      if(catEl) catEl.value = inferCategoryFromKind(kindGuess);
      msg.textContent = `Found: ${labelGuess} • Suggested: ${kindGuess}. Check/edit before adding.`;
    }else{
      msg.textContent = `Found: ${labelGuess}. Check/edit before adding.`;
    }
  }else{
    msg.textContent = `Scanned: ${code} (edit to actual bottle name)`;
  }

            msg.textContent=`Scanned: ${code} — looking up…`;
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
      renderInventory();
  initWebSuggest(); renderCocktails();
  initLinkImporter();
  initCocktailAdd();
  initWheel();
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
  initLinkImporter();
  initCocktailAdd();
  initWheel();
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
$("nav-wheel").addEventListener("click",()=>setView("wheel"));

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
  renderInventory();
  initWebSuggest(); renderCocktails();
  initLinkImporter();
  initCocktailAdd();
  initWheel();
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
  renderInventory();
  initWebSuggest(); renderCocktails();
  initLinkImporter();
  initCocktailAdd();
  initWheel();
  alert("Restored default inventory.");
});


init();
// Glass icon helpers
function glassEmoji(glass){
  const g=(glass||"").toLowerCase();
  if(g.includes("margarita")) return "🍹";
  if(g.includes("rocks")) return "🥃";
  if(g.includes("coupe")||g.includes("martini")) return "🍸";
  if(g.includes("highball")||g.includes("collins")) return "🥤";
  if(g.includes("wine")) return "🍷";
  if(g.includes("mug")) return "☕";
  return "🍹";
}

// --- Barcode online lookup (best-effort, no API key) ---
async function lookupBarcodeOnline(barcode){
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
  try{
    const resp = await fetch(url, {cache:"no-cache"});
    if(!resp.ok) return null;
    const j = await resp.json();
    if(!j || j.status !== 1 || !j.product) return null;
    const p = j.product;
    const name = (p.product_name || p.product_name_en || "").trim();
    const brands = (p.brands || "").split(",")[0]?.trim() || "";
    const categories = (p.categories || p.categories_tags || "").toString().toLowerCase();
    return {name, brands, categories, raw:p};
  }catch(e){ return null; }
}

function inferKindFromText(text){
  const t=(text||"").toLowerCase();
  const rules=[
    ["gin","Gin"],["vodka","Vodka"],["bourbon","Bourbon"],["rye","Rye whiskey"],
    ["mezcal","Mezcal"],["tequila","Tequila"],["cognac","Cognac/Brandy"],["brandy","Cognac/Brandy"],
    ["vermouth","Sweet vermouth"],["campari","Campari"],["aperol","Aperol"],["chartreuse","Green Chartreuse"],
    ["fernet","Fernet"],["rum","Rum"],["cachaca","Cachaça"],["arak","Anise spirit"],["ouzo","Anise spirit"],["pernod","Anise spirit"]
  ];
  for(const [k,v] of rules){ if(t.includes(k)) return v; }
  return null;
}
function inferCategoryFromKind(kind){
  const k=(kind||"").toLowerCase();
  const modifier=["vermouth","campari","aperol","chartreuse","fernet","amaro","liqueur","cassis","triple sec","bitters"];
  if(modifier.some(x=>k.includes(x))) return "modifier";
  return "spirit";
}

// --- Wheel of Fortune ---
let WHEEL_MODE = "can"; // "can" or "all"
let wheelState = {spinning:false, angle:0, lastPick:null};

function getWheelCocktails(){
  const list = (BASE?.cocktails||[]).slice();
  if(WHEEL_MODE==="all") return list;
  const inv=mergedInventory();
  const haveKinds = new Set((inv.items||[]).filter(i=>i.have).map(i=>i.kind));
  return list.filter(c=> (c.needs||[]).every(n=>haveKinds.has(n.kind)));
}

function drawWheel(names, angle){
  const canvas = $("wheelCanvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const cx=w/2, cy=h/2;
  const r = Math.min(w,h)/2 - 10;
  ctx.clearRect(0,0,w,h);
  if(!names.length){
    ctx.font="16px system-ui";
    ctx.fillStyle="#bbb";
    ctx.textAlign="center";
    ctx.fillText("No cocktails available", cx, cy);
    return;
  }
  const n = names.length;
  const step = (Math.PI*2)/n;
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle);
  for(let i=0;i<n;i++){
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.arc(0,0,r, i*step, (i+1)*step);
    ctx.closePath();
    ctx.fillStyle = i%2===0 ? "#1a1a1a" : "#111";
    ctx.fill();
    ctx.strokeStyle="#2a2a2a"; ctx.stroke();

    ctx.save();
    ctx.rotate(i*step + step/2);
    ctx.textAlign="right";
    ctx.fillStyle="#ddd";
    ctx.font="12px system-ui";
    const label = names[i].length>22 ? names[i].slice(0,22)+"…" : names[i];
    ctx.fillText(label, r-10, 4);
    ctx.restore();
  }
  ctx.restore();

  // pointer
  ctx.fillStyle="#ffcc66";
  ctx.beginPath();
  ctx.moveTo(cx, cy-r-2);
  ctx.lineTo(cx-10, cy-r-22);
  ctx.lineTo(cx+10, cy-r-22);
  ctx.closePath(); ctx.fill();
}

function easeOutCubic(t){ return 1 - Math.pow(1-t,3); }

function spinWheel(){
  if(wheelState.spinning) return;
  const list = getWheelCocktails();
  const names = list.map(c=>c.name);
  if(!names.length){
    $("wheelResult").textContent = "Nothing available to spin. Turn on more inventory or switch mode.";
    return;
  }
  const n = names.length;
  const step = (Math.PI*2)/n;
  const pick = Math.floor(Math.random()*n);
  wheelState.lastPick = list[pick];
  const spins = 6 + Math.random()*3;
  const targetAngle = (Math.PI*2)*spins + (Math.PI*2) - (pick*step + step/2);
  const start = performance.now();
  const duration = 2200;
  wheelState.spinning = true;
  const startAngle = wheelState.angle;

  function frame(now){
    const t = Math.min(1, (now-start)/duration);
    const a = startAngle + targetAngle*easeOutCubic(t);
    wheelState.angle = a;
    drawWheel(names, a);
    if(t<1) requestAnimationFrame(frame);
    else{
      wheelState.spinning=false;
      const c = wheelState.lastPick;
      $("wheelResult").innerHTML = `<b>${c.name}</b> • ${glassEmoji(c.glass)} ${c.glass||""}<br><span class="small">${c.method||""}</span>`;
    }
  }
  requestAnimationFrame(frame);
}

function initWheel(){
  const btn = $("btn-spin");
  const modeBtn = $("btn-wheel-mode");
  if(btn) btn.addEventListener("click", spinWheel);
  if(modeBtn) modeBtn.addEventListener("click", ()=>{
    WHEEL_MODE = (WHEEL_MODE==="can") ? "all" : "can";
    modeBtn.textContent = (WHEEL_MODE==="can") ? "Mode: Can Make" : "Mode: All";
    const list = getWheelCocktails();
    drawWheel(list.map(c=>c.name), wheelState.angle);
    $("wheelResult").textContent = "";
  });
  const list = getWheelCocktails();
  drawWheel(list.map(c=>c.name), 0);
  const sbtn = $("btn-surprise-online");
  if(sbtn) sbtn.addEventListener("click", openSurpriseSearch);
}


// --- Cocktail import & manual add ---
function parseAmountToMl(line){
  // supports: "2 oz", "1 ounce", "3/4 oz", "15 ml", "1/2 oz"
  const t=(line||"").toLowerCase();
  const frac = (s)=>{
    const m=s.match(/(\d+)\s*\/\s*(\d+)/);
    if(m) return parseFloat(m[1])/parseFloat(m[2]);
    return null;
  };
  let ml=null;
  // ml
  let m=t.match(/(\d+(?:\.\d+)?)\s*ml/);
  if(m) ml=parseFloat(m[1]);
  // oz / ounce
  if(ml==null){
    m=t.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounce|ounces)\b/);
    if(m) ml=parseFloat(m[1])*29.5735;
  }
  // fraction oz like 3/4 oz
  if(ml==null){
    m=t.match(/(\d+\s*\/\s*\d+)\s*(?:oz|ounce|ounces)\b/);
    if(m){
      const v=frac(m[1]);
      if(v!=null) ml=v*29.5735;
    }
  }
  // unicode fractions (½ ¼ ¾)
  if(ml==null){
    const map={"½":0.5,"¼":0.25,"¾":0.75};
    for(const k in map){
      const rx=new RegExp(k+"\s*(?:oz|ounce|ounces)\\b");
      if(rx.test(t)){ ml=map[k]*29.5735; break; }
    }
  }
  if(ml==null) return null;
  return Math.round(ml);
}

function parseIngredientLine(line){
  const raw=(line||"").trim();
  if(!raw) return null;
  const amount_ml = parseAmountToMl(raw);
  const requires = inferKindFromText(raw) || raw; // fallback
  // clean item name by stripping leading measures
  let item = raw.replace(/^\s*(\d+\s*\/\s*\d+|\d+(?:\.\d+)?|½|¼|¾)\s*(?:oz|ounce|ounces|ml|tsp|tbsp|dash|dashes)?\s*/i,"").trim();
  item = item.replace(/^\s*(of)\s+/i,"").trim();
  return {item, amount_ml, requires};
}

function inferMethodFromSteps(steps){
  const t = (steps||[]).join(" ").toLowerCase();
  if(t.includes("shake")) return "shake";
  if(t.includes("stir")) return "stir";
  if(t.includes("build")) return "build";
  return "stir";
}

async function fetchViaJina(url){
  const prox = "https://r.jina.ai/" + url;
  const resp = await fetch(prox, {cache:"no-cache"});
  if(!resp.ok) throw new Error("Fetch failed");
  return await resp.text();
}

function extractRecipeJsonLd(text){
  // Find a JSON object/array containing "@type":"Recipe"
  const idx = text.indexOf('"@type"');
  if(idx<0) return null;
  const chunks = [];
  // try to find <script type="application/ld+json"> blocks in the rendered text
  const re1 = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while((m=re1.exec(text))){
    chunks.push(m[1]);
  }
  if(!chunks.length) chunks.push(text);
  for(const ch of chunks){
    const s = ch.trim();
    // try parsing whole block
    try{
      const j = JSON.parse(s);
      const arr = Array.isArray(j)? j : [j];
      for(const x of arr){
        if(!x) continue;
        if(x["@type"]==="Recipe") return x;
        if(Array.isArray(x["@graph"])){
          const r = x["@graph"].find(n=>n && n["@type"]==="Recipe");
          if(r) return r;
        }
      }
    }catch(e){
      // sometimes multiple JSON objects; try to locate first {...} containing Recipe
      const rx = /\{[\s\S]*?\}/g;
      let mm;
      while((mm=rx.exec(s))){
        const cand = mm[0];
        if(cand.includes('"Recipe"') || cand.includes('"@type":"Recipe"')){
          try{
            const jj=JSON.parse(cand);
            if(jj && jj["@type"]==="Recipe") return jj;
          }catch(e2){}
        }
      }
    }
  }
  return null;
}

async function importCocktailFromUrl(url){
  const msg = $("cocktail-import-msg");
  if(msg) msg.textContent = "Importing…";
  const text = await fetchViaJina(url);
  const rec = extractRecipeJsonLd(text);
  if(!rec) throw new Error("No recipe data found");
  const name = (rec.name || "").trim();
  const ing = rec.recipeIngredient || [];
  const instr = rec.recipeInstructions || [];
  const steps = Array.isArray(instr) ? instr.map(x=> (typeof x==="string"? x : (x.text||""))).filter(Boolean)
                                    : [typeof instr==="string"? instr : (instr.text||"")].filter(Boolean);
  const ingredients = ing.map(parseIngredientLine).filter(Boolean).map(x=>({item:x.item, amount_ml:x.amount_ml, requires:x.requires}));
  const method = inferMethodFromSteps(steps);
  return {
    id: slug(name || "imported-" + Date.now()),
    name: name || "Imported cocktail",
    liked: true,
    house: false,
    glass: inferKindFromText(name)?.toLowerCase().includes("margarita") ? "margarita" : "rocks",
    method,
    source: "Imported",
    source_url: url,
    ingredients,
    garnish: "",
    steps
  };
}

function fillCocktailForm(c){
  $("cocktail-name").value = c.name || "";
  $("cocktail-glass").value = (c.glass || "rocks").toLowerCase();
  $("cocktail-method").value = (c.method || "stir").toLowerCase();
  $("cocktail-garnish").value = c.garnish || "";
  $("cocktail-ingredients").value = (c.ingredients||[]).map(i=>{
    const ml=i.amount_ml!=null ? `${mlToOz(i.amount_ml)} oz` : "";
    return `${ml} ${i.item}`.trim();
  }).join("\n");
  $("cocktail-steps").value = (c.steps||[]).join("\n");
}

function readCocktailForm(){
  const name = $("cocktail-name").value.trim();
  const glass = $("cocktail-glass").value;
  const method = $("cocktail-method").value;
  const garnish = $("cocktail-garnish").value.trim();
  const url = $("cocktail-url").value.trim();
  const ingredients = $("cocktail-ingredients").value.split(/\n+/).map(s=>s.trim()).filter(Boolean).map(parseIngredientLine).filter(Boolean)
    .map(x=>({item:x.item, amount_ml:x.amount_ml, requires:x.requires}));
  const steps = $("cocktail-steps").value.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  return {
    id: slug(name || ("custom-" + Date.now())),
    name: name || "Custom cocktail",
    liked: true,
    house: false,
    glass,
    method,
    source: url ? "Link" : "Custom",
    source_url: url || "",
    ingredients,
    garnish,
    steps
  };
}

function upsertUserCocktail(c){
  if(!USER.cocktails) USER.cocktails=[];
  const idx = USER.cocktails.findIndex(x=>x.id===c.id || (x.name||"").toLowerCase()===(c.name||"").toLowerCase());
  if(idx>=0) USER.cocktails[idx]=c;
  else USER.cocktails.push(c);
  saveUser();
  renderCocktails();
  initLinkImporter();
  renderChoice(); // keeps wheel/choice up to date
}

function clearCocktailForm(){
  $("cocktail-url").value="";
  $("cocktail-name").value="";
  $("cocktail-glass").value="rocks";
  $("cocktail-method").value="stir";
  $("cocktail-garnish").value="";
  $("cocktail-ingredients").value="";
  $("cocktail-steps").value="";
  if($("cocktail-import-msg")) $("cocktail-import-msg").textContent="";
}

function initCocktailAdd(){
  const btnImport = $("btn-import-cocktail");
  const btnSave = $("btn-save-cocktail");
  const btnClear = $("btn-clear-cocktail");
  if(btnImport){
    btnImport.addEventListener("click", async ()=>{
      const url=$("cocktail-url").value.trim();
      if(!url) return;
      try{
        const c = await importCocktailFromUrl(url);
        fillCocktailForm(c);
        if($("cocktail-import-msg")) $("cocktail-import-msg").textContent = "Imported. Review and Save.";
      }catch(e){
        if($("cocktail-import-msg")) $("cocktail-import-msg").textContent = "Could not import from that link. You can fill manually.";
      }
    });
  }
  if(btnSave){
    btnSave.addEventListener("click", ()=>{
      const c = readCocktailForm();
      upsertUserCocktail(c);
      if($("cocktail-import-msg")) $("cocktail-import-msg").textContent = "Saved.";
    });
  }
  if(btnClear){
    btnClear.addEventListener("click", clearCocktailForm);
  }
}

// --- Surprise online search ---
function pickRandom(arr, n){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

function buildSurpriseQuery(includeModifiers=false){
  const inv = mergedInventory();
  const have = (inv.items||[]).filter(x=>x.have);
  // build pool: prefer "kind" but include 1-2 brand labels
  const spirits = have.filter(x=>x.category==="spirit");
  const modifiers = have.filter(x=>x.category==="modifier");
  const pool = includeModifiers ? spirits.concat(modifiers) : spirits;

  // If nothing, fall back
  if(!pool.length) return "cocktail recipe";

  // pick 3-5 terms; favor kinds, then labels
  const kindTerms = [...new Set(pool.map(x=>x.kind).filter(Boolean))];
  const labelTerms = [...new Set(pool.map(x=>x.label).filter(Boolean))];

  const terms = pickRandom(kindTerms, 3).concat(pickRandom(labelTerms, 2));
  // clean terms
  return "cocktail recipe " + terms.map(t=>String(t).replace(/[^\w\s\-&/]/g,"").trim()).filter(Boolean).join(" ");
}

function openSurpriseSearch(){
  const src = $("surprise-source")?.value || "liquor";
  const mode = $("surprise-mode")?.value || "spirits";
  const q = buildSurpriseQuery(mode==="all");
  const display = $("surpriseQuery");
  if(display) display.textContent = q;

  let url;
  if(src==="liquor"){
    // Use Google search but strongly biased to Liquor.com (they don't have a stable public on-site search endpoint)
    const qq = "site:liquor.com " + q;
    url = "https://www.google.com/search?q=" + encodeURIComponent(qq);
  }else{
    url = "https://www.google.com/search?q=" + encodeURIComponent(q);
  }
  window.open(url, "_blank", "noopener");
}

// --- Add cocktail by link (Liquor.com preferred) ---
let IMPORTED_COCKTAIL = null;

function esc(s){ return (s??"").toString().replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

function normalizeGlass(g){
  const t=(g||"").toLowerCase();
  if(t.includes("margarita")) return "margarita";
  if(t.includes("coupe")) return "coupe";
  if(t.includes("martini")) return "martini";
  if(t.includes("collins")||t.includes("highball")) return "highball";
  if(t.includes("rocks")||t.includes("old fashioned")) return "rocks";
  if(t.includes("nick")||t.includes("nora")) return "coupe";
  if(t.includes("mug")) return "mug";
  return g || "rocks";
}

function methodGuess(stepsText){
  const s=(stepsText||"").toLowerCase();
  if(s.includes("shake")) return "shaken";
  if(s.includes("stir")) return "stirred";
  if(s.includes("build")) return "build";
  return "stirred";
}

async function fetchTextViaJina(url){
  // Jina AI proxy renders the target page as text (helps bypass CORS)
  const clean = url.replace(/^http:\/\//i,"https://");
  const prox = "https://r.jina.ai/" + clean;
  const resp = await fetch(prox, {cache:"no-cache"});
  if(!resp.ok) throw new Error("HTTP "+resp.status);
  return await resp.text();
}

function extractJsonLd(html){
  const reScript = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m, blocks=[];
  while((m=reScript.exec(html))){
    const raw = m[1].trim();
    if(raw) blocks.push(raw);
  }
  for(const b of blocks){
    try{
      const j = JSON.parse(b);
      // could be array or @graph
      const candidates = [];
      if(Array.isArray(j)) candidates.push(...j);
      else if(j && j["@graph"]) candidates.push(...j["@graph"]);
      else candidates.push(j);
      for(const c of candidates){
        const t = (c["@type"]||c.type||"");
        if((Array.isArray(t) ? t.includes("Recipe") : (t==="Recipe"))){
          return c;
        }
      }
    }catch(e){}
  }
  return null;
}

function recipeToCocktail(recipe){
  const name = recipe.name || "Imported cocktail";
  const ing = (recipe.recipeIngredient||[]).map(x=>x.toString());
  const inst = recipe.recipeInstructions || [];
  let steps = "";
  if(Array.isArray(inst)){
    steps = inst.map(s=> (typeof s==="string"?s:(s.text||""))).filter(Boolean).join(" ");
  }else if(typeof inst==="string") steps = inst;
  else steps = inst.text || "";

  // Liquor.com often includes "recipeCategory" / "keywords" / "description"
  let glass = normalizeGlass(recipe.suitableForDiet || recipe.recipeCategory || "");
  // Better: infer from name for Margarita
  if(name.toLowerCase().includes("margarita")) glass = "margarita";

  const method = methodGuess(steps);

  // Map needs (kinds) is hard from free-text. We'll keep as freeform ingredients for now, and set needs empty.
  return {
    id: "user-" + Math.random().toString(16).slice(2),
    name,
    glass,
    method,
    ingredients: ing,
    steps,
    liked: true,
    house: false,
    needs: []
  };
}

async function importCocktailByLink(){
  const url = $("c-import-url")?.value?.trim();
  if(!url){
    $("c-import-status").textContent = "Paste a link first.";
    return;
  }
  $("c-import-status").textContent = "Importing…";
  $("c-save-btn").disabled = true;
  $("c-import-preview").style.display = "none";
  IMPORTED_COCKTAIL = null;

  try{
    const page = await fetchTextViaJina(url);
    const recipe = extractJsonLd(page);
    if(!recipe) throw new Error("No Recipe data found on that page.");
    const c = recipeToCocktail(recipe);
    c.source = url;
    IMPORTED_COCKTAIL = c;

    $("c-import-status").innerHTML = `Imported: <b>${esc(c.name)}</b> • ${glassEmoji(c.glass)} ${esc(c.glass)} • ${esc(c.method)}`;
    $("c-import-preview").style.display = "block";
    $("c-import-preview").innerHTML =
      `<div><b>Ingredients</b>: ${esc((c.ingredients||[]).slice(0,8).join(" • "))}${(c.ingredients||[]).length>8?" …":""}</div>`+
      `<div style="margin-top:6px"><b>Steps</b>: ${esc((c.steps||"").slice(0,180))}${(c.steps||"").length>180?" …":""}</div>`;
    $("c-save-btn").disabled = false;
  }catch(e){
    $("c-import-status").textContent = "Import failed: " + (e?.message||e);
  }
}

function saveImportedCocktail(){
  if(!IMPORTED_COCKTAIL) return;
  USER.cocktails = USER.cocktails || [];
  USER.cocktails.unshift(IMPORTED_COCKTAIL);
  saveUser();
  $("c-import-status").textContent = "Saved ✔";
  $("c-save-btn").disabled = true;
  $("c-import-preview").style.display = "none";
  $("c-import-url").value = "";
  renderCocktails();
  initLinkImporter();
}

function initLinkImporter(){
  const b = $("c-import-btn");
  const s = $("c-save-btn");
  if(b && !b._wired){
    b._wired = true;
    b.addEventListener("click", importCocktailByLink);
  }
  if(s && !s._wired){
    s._wired = true;
    s.addEventListener("click", saveImportedCocktail);
  }
}

// V7 quick Liquor.com importer fallback
function quickLiquorImport(url){
  if(url.includes("boulevardier")) return "boulevardier";
  if(url.includes("gold-rush")) return "gold-rush";
  return null;
}

let LAST_WHEEL_ID=null;

function openCocktailById(id){
  const all = (BASE?.cocktails||[]).concat((USER?.cocktails||[]));
  const c = all.find(x=>x.id===id);
  if(!c) return;
  if(typeof showCocktail==='function') return showCocktail(id);
  if(typeof openCocktail==='function') return openCocktail(id);
}

function wireWheelResultLink(){
  const wl = $("wheelResultLink");
  if(wl && !wl._wired){
    wl._wired=true;
    wl.addEventListener("click",(e)=>{
      e.preventDefault();
      if(!LAST_WHEEL_ID) return;
      if(typeof setView==="function") setView("cocktails");
      openCocktailById(LAST_WHEEL_ID);
    });
  }
}

// --- Web cocktail suggestions (TheCocktailDB + Liquor.com search) ---
function normalizeKindForCocktailDB(kind){
  const k=(kind||"").toLowerCase();
  if(k.includes("bourbon")||k.includes("rye")||k.includes("scotch")||k.includes("whiskey")) return "Whiskey";
  if(k.includes("gin")) return "Gin";
  if(k.includes("vodka")) return "Vodka";
  if(k.includes("tequila")) return "Tequila";
  if(k.includes("mezcal")) return "Mezcal";
  if(k.includes("rum")) return "Rum";
  if(k.includes("brandy")||k.includes("cognac")) return "Brandy";
  if(k.includes("vermouth")) return "Vermouth";
  if(k.includes("campari")) return "Campari";
  if(k.includes("aperol")) return "Aperol";
  if(k.includes("chartreuse")) return "Chartreuse";
  return kind || "Gin";
}

async function fetchCocktailDBByIngredient(ingredient){
  const url = "https://www.thecocktaildb.com/api/json/v1/1/filter.php?i=" + encodeURIComponent(ingredient);
  const resp = await fetch(url, {cache:"no-cache"});
  if(!resp.ok) throw new Error("Fetch failed");
  const j = await resp.json();
  return (j && j.drinks) ? j.drinks : [];
}

function openLiquorSearchForKind(kind){
  const q = "site:liquor.com " + kind + " cocktail recipe";
  const url = "https://www.google.com/search?q=" + encodeURIComponent(q);
  window.open(url, "_blank", "noopener");
}

function openCocktailDBDrink(id){
  const url = "https://www.thecocktaildb.com/drink/" + encodeURIComponent(id);
  window.open(url, "_blank", "noopener");
}

function renderWebSuggestResults(drinks, baseKind){
  const box = $("web-suggest-results");
  if(!box) return;
  if(!drinks.length){
    box.innerHTML = "";
    $("web-suggest-status").textContent = `No results found for ${baseKind}. Try another spirit.`;
    return;
  }
  $("web-suggest-status").textContent = `Found ${drinks.length} ideas for ${baseKind} (from TheCocktailDB). Tap any to open.`;
  box.innerHTML = drinks.slice(0, 24).map(d=>{
    const img = d.strDrinkThumb || "";
    const name = d.strDrink || "Cocktail";
    const id = d.idDrink || "";
    return `<div class="webCard" data-id="${id}">
      <img class="webThumb" src="${img}" alt="">
      <div class="webName">${name}</div>
      <div class="webMeta">Ingredient: ${baseKind}</div>
    </div>`;
  }).join("");
  box.querySelectorAll(".webCard").forEach(card=>{
    card.addEventListener("click", ()=>{
      const id = card.getAttribute("data-id");
      if(id) openCocktailDBDrink(id);
    });
  });
}

async function runWebSuggest(){
  const sel = $("web-spirit");
  const kind = sel ? sel.value : "";
  const base = normalizeKindForCocktailDB(kind);
  const status = $("web-suggest-status");
  if(status) status.textContent = "Searching…";
  try{
    const drinks = await fetchCocktailDBByIngredient(base);
    renderWebSuggestResults(drinks, base);
  }catch(e){
    if(status) status.textContent = "Could not fetch suggestions (network/CORS). Use “Open Liquor.com” instead.";
    const box = $("web-suggest-results");
    if(box) box.innerHTML = "";
  }
}

function initWebSuggest(){
  const sel = $("web-spirit");
  if(!sel) return;
  const inv = mergedInventory();
  const haveKinds = Array.from(new Set((inv.items||[]).filter(i=>i.have).map(i=>i.kind))).filter(Boolean);
  haveKinds.sort((a,b)=>a.localeCompare(b));
  sel.innerHTML = haveKinds.map(k=>`<option value="${k}">${k}</option>`).join("");
  const btn = $("btn-web-suggest");
  const btnL = $("btn-web-open-liquor");
  if(btn && !btn._wired){
    btn._wired=true;
    btn.addEventListener("click", runWebSuggest);
  }
  if(btnL && !btnL._wired){
    btnL._wired=true;
    btnL.addEventListener("click", ()=>openLiquorSearchForKind(sel.value||"cocktail"));
  }
}

/* ===== V7.5 Web Suggestions Override (robust + import + can-make) ===== */
async function fetchCocktailDBDetails(id){
  const url = "https://www.thecocktaildb.com/api/json/v1/1/lookup.php?i=" + encodeURIComponent(id);
  const resp = await fetch(url, {cache:"no-cache"});
  if(!resp.ok) throw new Error("Fetch failed");
  const j = await resp.json();
  return (j && j.drinks && j.drinks[0]) ? j.drinks[0] : null;
}

function extractDrinkIngredients(d){
  const out=[];
  for(let i=1;i<=15;i++){
    const ing = d["strIngredient"+i];
    const meas = d["strMeasure"+i];
    if(ing && ing.trim()){
      out.push({ingredient: ing.trim(), measure: (meas||"").trim()});
    }
  }
  return out;
}

function isIgnoredPantryItem(name){
  const n=(name||"").toLowerCase();
  const ignore = ["ice","water","soda water","sparkling water","club soda","salt","sugar","brown sugar","demerara",
                  "lemon","lemon juice","lime","lime juice","orange","orange peel","orange twist","espresso",
                  "coffee","coffee beans","mint"];
  return ignore.some(x=>n===x || n.includes(x));
}

function buildInventoryTokenSet(){
  const inv = mergedInventory();
  const items = inv.items || [];
  const tokens = new Set();
  items.forEach(i=>{
    if(i.have===false) return; // treat unset as available-ish
    (i.kind||"").toLowerCase().split(/[\/,(\)\- ]+/).filter(Boolean).forEach(t=>tokens.add(t));
    (i.label||"").toLowerCase().split(/[\/,(\)\- ]+/).filter(Boolean).forEach(t=>tokens.add(t));
  });
  ["whiskey","bourbon","rye","scotch","gin","vodka","tequila","mezcal","rum","vermouth","campari","aperol","chartreuse","amaro","brandy","cognac","kahlua","coffee","liqueur"].forEach(t=>tokens.add(t));
  return tokens;
}

function ingredientMatchesInventory(ing, tokens){
  const n=(ing||"").toLowerCase();
  if(isIgnoredPantryItem(n)) return true;
  const map = [
    ["bourbon", ["bourbon","whiskey"]],
    ["rye", ["rye","whiskey"]],
    ["scotch", ["scotch","whiskey"]],
    ["whiskey", ["whiskey","bourbon","rye","scotch"]],
    ["gin", ["gin"]],
    ["vodka", ["vodka"]],
    ["tequila", ["tequila"]],
    ["mezcal", ["mezcal"]],
    ["rum", ["rum"]],
    ["vermouth", ["vermouth"]],
    ["campari", ["campari"]],
    ["aperol", ["aperol"]],
    ["chartreuse", ["chartreuse"]],
    ["coffee liqueur", ["coffee","kahlua","liqueur"]],
    ["kahlua", ["kahlua","coffee"]],
  ];
  for(const [key, opts] of map){
    if(n.includes(key)){
      return opts.some(o=>tokens.has(o));
    }
  }
  return Array.from(tokens).some(t=>t.length>=4 && n.includes(t));
}

function drinkCanMakeNow(fullDrink, tokens){
  const ings = extractDrinkIngredients(fullDrink);
  return ings.every(x=>ingredientMatchesInventory(x.ingredient, tokens));
}

function inferMethodFromInstructions(text){
  const t=(text||"").toLowerCase();
  if(t.includes("shake")) return "shake";
  if(t.includes("stir")) return "stir";
  if(t.includes("build") || t.includes("top with")) return "build";
  return "build";
}

function glassFromCocktailDB(glassName){
  const g=(glassName||"").toLowerCase();
  if(g.includes("martini") || g.includes("cocktail")) return "cocktail";
  if(g.includes("highball") || g.includes("collins")) return "highball";
  if(g.includes("old-fashioned") || g.includes("rocks")) return "rocks";
  if(g.includes("mug")) return "mug";
  if(g.includes("coupe")) return "coupe";
  return "rocks";
}

async function importCocktailDBDrink(id){
  const status = $("web-suggest-status");
  if(status) status.textContent = "Importing…";
  try{
    const d = await fetchCocktailDBDetails(id);
    if(!d) throw new Error("No drink details");
    const ing = extractDrinkIngredients(d);
    const ingredients = ing.map(x=>({ item: (`${x.measure} ${x.ingredient}`).trim(), amount_ml: null }));
    const c = {
      id: "db-" + (d.idDrink||Math.random().toString(16).slice(2)),
      name: d.strDrink || "Imported cocktail",
      glass: glassFromCocktailDB(d.strGlass),
      method: inferMethodFromInstructions(d.strInstructions),
      liked: true,
      house: false,
      ingredients,
      steps: (d.strInstructions||"").split(/\n|\.(?=\s+[A-Z])/).map(s=>s.trim()).filter(Boolean),
      source: "TheCocktailDB",
      source_url: "https://www.thecocktaildb.com/drink/" + encodeURIComponent(d.idDrink||"")
    };
    USER.cocktails = USER.cocktails || [];
    if(USER.cocktails.some(x=>(x.name||"").toLowerCase()===c.name.toLowerCase())){
      if(status) status.textContent = `Already imported: ${c.name}`;
      return;
    }
    USER.cocktails.unshift(c);
    saveUser();
    if(status) status.textContent = `Imported ✔ ${c.name}`;
    if(typeof setView==="function"){ setView("cocktails"); }
    if(typeof renderCocktails==="function"){ renderCocktails(); }
  }catch(e){
    if(status) status.textContent = "Import failed.";
  }
}

function renderWebSuggestResults(drinks, baseKind){
  const box = $("web-suggest-results");
  if(!box) return;
  if(!drinks.length){
    box.innerHTML = "";
    $("web-suggest-status").textContent = `No results found for ${baseKind}. Try another spirit.`;
    return;
  }
  box.innerHTML = drinks.slice(0, 24).map(d=>{
    const img = d.strDrinkThumb || "";
    const name = d.strDrink || "Cocktail";
    const id = d.idDrink || "";
    return `<div class="webCard" data-id="${id}">
      <img class="webThumb" src="${img}" alt="">
      <div class="webName">${name}</div>
      <div class="webMeta">Ingredient: ${baseKind}</div>
      <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
        <button class="btn" data-act="open">Open</button>
        <button class="btn primary" data-act="import">Import</button>
      </div>
    </div>`;
  }).join("");

  box.querySelectorAll(".webCard").forEach(card=>{
    card.querySelectorAll("button[data-act]").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        const act = btn.getAttribute("data-act");
        const id = card.getAttribute("data-id");
        if(!id) return;
        if(act==="open") openCocktailDBDrink(id);
        if(act==="import") importCocktailDBDrink(id);
      });
    });
  });
}

async function runWebSuggest(){
  const sel = $("web-spirit");
  const kind = sel ? sel.value : "";
  const base = normalizeKindForCocktailDB(kind);
  const canMakeOnly = $("web-canmake") ? $("web-canmake").checked : false;
  const status = $("web-suggest-status");
  if(status) status.textContent = "Searching…";
  try{
    const drinks = await fetchCocktailDBByIngredient(base);
    if(!canMakeOnly){
      if(status) status.textContent = `Found ${drinks.length} ideas for ${base} (from TheCocktailDB).`;
      renderWebSuggestResults(drinks, base);
      return;
    }
    const tokens = buildInventoryTokenSet();
    const subset = drinks.slice(0, 12);
    if(status) status.textContent = `Checking what you can make now (first ${subset.length})…`;
    const checks = await Promise.all(subset.map(async d=>{
      try{
        const full = await fetchCocktailDBDetails(d.idDrink);
        if(!full) return null;
        return drinkCanMakeNow(full, tokens) ? d : null;
      }catch(e){ return null; }
    }));
    const ok = checks.filter(Boolean);
    if(status) status.textContent = ok.length ? `You can make ${ok.length} of the first ${subset.length} ${base} ideas.` : `No matches (checked ${subset.length}). Try another spirit.`;
    renderWebSuggestResults(ok, base);
  }catch(e){
    if(status) status.textContent = "Could not fetch suggestions. Use “Open Liquor.com” instead.";
    const box = $("web-suggest-results");
    if(box) box.innerHTML = "";
  }
}

function initWebSuggest(){
  const sel = $("web-spirit");
  if(!sel) return;
  const inv = mergedInventory();
  const items = inv.items || [];
  const haveKinds = Array.from(new Set(items.filter(i=>i.have===true).map(i=>i.kind))).filter(Boolean);
  const allKinds  = Array.from(new Set(items.map(i=>i.kind))).filter(Boolean);
  const kinds = (haveKinds.length ? haveKinds : allKinds);
  kinds.sort((a,b)=>a.localeCompare(b));
  sel.innerHTML = kinds.map(k=>`<option value="${k}">${k}</option>`).join("");
  const btn = $("btn-web-suggest");
  const btnL = $("btn-web-open-liquor");
  if(btn && !btn._wired_v75){
    btn._wired_v75=true;
    btn.addEventListener("click", runWebSuggest);
  }
  if(btnL && !btnL._wired_v75){
    btnL._wired_v75=true;
    btnL.addEventListener("click", ()=>openLiquorSearchForKind(sel.value||"cocktail"));
  }
}
