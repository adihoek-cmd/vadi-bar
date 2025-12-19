let DATA = null;
let CURRENT = null;

const $ = (id) => document.getElementById(id);

function fmtAmt(x){
  if(x === undefined || x === null) return "";
  if(typeof x === "number") return `${x} ml`;
  return `${x}`;
}

function glassSVG(kind){
  const common = `class="svgglass" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"`;
  if(kind === "coupe"){
    return `<svg ${common}><path d="M14 10h36c0 14-9 23-18 23S14 24 14 10Z" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M32 33v13" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M22 58h20" stroke="white" stroke-opacity=".7" stroke-width="3"/></svg>`;
  }
  if(kind === "mug"){
    return `<svg ${common}><path d="M18 18h26v30H18V18Z" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M44 24h6c4 0 6 3 6 7s-2 7-6 7h-6" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M20 52h22" stroke="white" stroke-opacity=".7" stroke-width="3"/></svg>`;
  }
  return `<svg ${common}><path d="M18 20h28l-4 32H22l-4-32Z" stroke="white" stroke-opacity=".7" stroke-width="3"/><path d="M22 28h20" stroke="white" stroke-opacity=".25" stroke-width="3"/><path d="M24 34h16" stroke="white" stroke-opacity=".25" stroke-width="3"/></svg>`;
}

function normalize(s){ return (s||"").toLowerCase(); }

function inventoryHaveSet(){
  const set = new Set();
  const inv = DATA.inventory;
  for(const group of ["spirits","modifiers","syrups","pantry"]){
    (inv[group]||[]).forEach(x => { if(x.have) set.add(x.name); });
  }
  return set;
}

function computeMakeability(c){
  const have = inventoryHaveSet();
  const missing = [];
  (c.ingredients||[]).forEach(i => {
    const key = i.requires;
    if(key && !have.has(key)) missing.push(key);
  });
  return {canMake: missing.length === 0, missing: [...new Set(missing)]};
}

function cocktailText(c){
  const ing = (c.ingredients||[]).map(i => `${i.item} ${fmtAmt(i.amount_ml ?? i.amount)} ${i.requires||""}`).join(" ");
  return `${c.name} ${c.method} ${c.glass} ${ing} ${c.garnish||""}`.toLowerCase();
}

function chipToggle(chip){
  const pressed = chip.getAttribute("aria-pressed")==="true";
  chip.setAttribute("aria-pressed", pressed ? "false" : "true");
  renderCocktails();
}

function badgeHTML(c){
  const {canMake} = computeMakeability(c);
  const out = [];
  if(c.liked) out.push(`<span class="badge liked">★ Liked</span>`);
  if(c.house) out.push(`<span class="badge">House</span>`);
  out.push(`<span class="badge method">${(c.method||"").toUpperCase()}</span>`);
  out.push(canMake ? `<span class="badge ok">Can make</span>` : `<span class="badge missing">Missing</span>`);
  return out.join(" ");
}

function cardHTML(c){
  return `
  <div class="card" data-id="${c.id}">
    <div class="row">
      <div>
        <div class="title">${c.name}</div>
        <div class="meta">${(c.glass||"").toUpperCase()} · ${c.source || ""}</div>
      </div>
      <div>${glassSVG(c.glass)}</div>
    </div>
    <div class="badges">${badgeHTML(c)}</div>
    <hr>
    <div class="small"><b>Build</b>: ${(c.method||"").replace("+", " + ")}</div>
    <div class="small"><b>Garnish</b>: ${c.garnish || "—"}</div>
  </div>`;
}

function passesFilters(c){
  const q = normalize($("q").value.trim());
  if(q && !cocktailText(c).includes(q)) return false;

  if($("chip-liked").getAttribute("aria-pressed")==="true" && !c.liked) return false;
  if($("chip-house").getAttribute("aria-pressed")==="true" && !c.house) return false;

  if($("chip-canmake").getAttribute("aria-pressed")==="true"){
    if(!computeMakeability(c).canMake) return false;
  }

  if($("chip-stir").getAttribute("aria-pressed")==="true"){
    if(!(c.method||"").includes("stir")) return false;
  }
  if($("chip-shake").getAttribute("aria-pressed")==="true"){
    if(!(c.method||"").includes("shake")) return false;
  }
  return true;
}

function renderCocktails(){
  if(!DATA) return;
  const list = DATA.cocktails.filter(passesFilters);
  $("grid").innerHTML = list.map(cardHTML).join("");
  $("foot").textContent = `Loaded ${DATA.cocktails.length} cocktails · Showing ${list.length} · Offline after first open`;
  document.querySelectorAll(".card").forEach(el => el.addEventListener("click", () => openDlg(el.getAttribute("data-id"))));
}

function renderInventory(){
  const inv = DATA.inventory;
  const sections = [
    ["Spirits", inv.spirits||[]],
    ["Modifiers", inv.modifiers||[]],
    ["Syrups", inv.syrups||[]],
    ["Pantry", inv.pantry||[]],
  ];
  $("invgrid").innerHTML = sections.map(([title, items]) => {
    const rows = items.map(it => {
      const pill = it.have ? `<span class="pill yes">Have</span>` : `<span class="pill no">Need</span>`;
      const ex = it.examples ? `<div class="small">${it.examples.join(" · ")}</div>` : "";
      const hm = it.homemade ? `<div class="small">Homemade</div>` : "";
      return `<div class="item"><div><div><b>${it.name}</b></div>${ex}${hm}</div>${pill}</div>`;
    }).join('<div style="height:10px"></div>');
    return `<div class="card"><div class="title">${title}</div><hr>${rows}</div>`;
  }).join("");
}

const MOODS = {
  bitter: ["negroni"],
  strong: ["vieux-carre","monte-carlo","rusty-nail","bb"],
  smoky: ["penicillin"],
  fresh: ["sidecar","margarita"],
  sweet: ["rusty-nail","bb","maple-old-fashioned"]
};

function renderChoice(mood){
  const ids = MOODS[mood] || [];
  const list = DATA.cocktails.filter(c => ids.includes(c.id));
  $("choicegrid").innerHTML = list.map(cardHTML).join("");
  document.querySelectorAll("#choicegrid .card").forEach(el => el.addEventListener("click", () => openDlg(el.getAttribute("data-id"))));
}

function openDlg(id){
  const c = DATA.cocktails.find(x => x.id === id);
  if(!c) return;
  CURRENT = c;

  const mk = computeMakeability(c);

  $("dlg-title").textContent = c.name;
  $("dlg-meta").textContent = `${(c.glass||"").toUpperCase()} · ${c.source || ""}`;
  $("dlg-glass").innerHTML = glassSVG(c.glass);

  const kv = [];
  if(c.liked) kv.push(`<span class="badge liked">★ Liked</span>`);
  if(c.house) kv.push(`<span class="badge">House Menu</span>`);
  kv.push(`<span class="badge method">${(c.method||"").toUpperCase()}</span>`);
  kv.push(mk.canMake ? `<span class="badge ok">Can make</span>` : `<span class="badge missing">Missing: ${mk.missing.join(", ")}</span>`);
  $("dlg-kv").innerHTML = kv.join(" ");

  const ing = $("dlg-ing");
  ing.innerHTML = "";
  (c.ingredients||[]).forEach(i => {
    const li = document.createElement("li");
    li.textContent = `${i.item} — ${fmtAmt(i.amount_ml ?? i.amount)}`;
    ing.appendChild(li);
  });

  $("dlg-missing").innerHTML = mk.canMake ? "" : `<b>Missing:</b> ${mk.missing.join(", ")}`;

  const steps = $("dlg-steps");
  steps.innerHTML = "";
  (c.steps||[]).forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    steps.appendChild(li);
  });

  $("dlg-garnish").innerHTML = `<b>Garnish:</b> ${c.garnish || "—"}`;
  $("dlg-notes").innerHTML = c.notes ? `<b>Note:</b> ${c.notes}` : "";

  const a = $("dlg-src");
  a.href = c.source_url || "#";
  a.textContent = c.source_url ? (c.source || "Source") : "—";

  // Make mode
  $("makebox").style.display = "none";
  $("checklist").innerHTML = "";

  $("dlg").showModal();
}

function startMakeMode(){
  if(!CURRENT) return;
  const key = `checks:${CURRENT.id}`;
  const saved = JSON.parse(localStorage.getItem(key) || "[]");

  const items = [
    ...CURRENT.ingredients.map(i => `Measure: ${i.item} (${fmtAmt(i.amount_ml ?? i.amount)})`),
    ...CURRENT.steps.map(s => `Step: ${s}`),
    `Garnish: ${CURRENT.garnish || "—"}`
  ];

  $("makebox").style.display = "block";
  const box = $("checklist");
  box.innerHTML = "";

  items.forEach((label, idx) => {
    const row = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = saved.includes(idx);
    cb.addEventListener("change", () => {
      const set = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
      if(cb.checked) set.add(idx); else set.delete(idx);
      localStorage.setItem(key, JSON.stringify([...set]));
    });
    const span = document.createElement("span");
    span.textContent = label;
    row.appendChild(cb);
    row.appendChild(span);
    box.appendChild(row);
  });
}

function resetChecks(){
  if(!CURRENT) return;
  localStorage.removeItem(`checks:${CURRENT.id}`);
  if($("makebox").style.display !== "none") startMakeMode();
}

function setView(which){
  const views = {
    cocktails: $("view-cocktails"),
    inventory: $("view-inventory"),
    choice: $("view-choice")
  };
  Object.values(views).forEach(v => v.style.display = "none");
  views[which].style.display = "block";

  // controls only for cocktails view
  $("controls").style.display = (which === "cocktails") ? "flex" : "none";

  document.querySelectorAll(".navbtn").forEach(b => b.classList.remove("active"));
  $(`nav-${which}`).classList.add("active");

  if(which === "cocktails") renderCocktails();
  if(which === "inventory") renderInventory();
}

function registerSW(){
  if("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }
}

async function load(){
  const resp = await fetch("./data/vadi-bar.json");
  DATA = await resp.json();
  renderCocktails();
  registerSW();
}

$("chip-liked").addEventListener("click", () => chipToggle($("chip-liked")));
$("chip-house").addEventListener("click", () => chipToggle($("chip-house")));
$("chip-canmake").addEventListener("click", () => chipToggle($("chip-canmake")));
$("chip-stir").addEventListener("click", () => chipToggle($("chip-stir")));
$("chip-shake").addEventListener("click", () => chipToggle($("chip-shake")));
$("q").addEventListener("input", () => renderCocktails());

$("dlg-close").addEventListener("click", () => $("dlg").close());
$("btn-make").addEventListener("click", () => startMakeMode());
$("btn-reset").addEventListener("click", () => resetChecks());

$("nav-cocktails").addEventListener("click", () => setView("cocktails"));
$("nav-inventory").addEventListener("click", () => setView("inventory"));
$("nav-choice").addEventListener("click", () => setView("choice"));

document.querySelectorAll("[data-mood]").forEach(btn => {
  btn.addEventListener("click", () => {
    const mood = btn.getAttribute("data-mood");
    renderChoice(mood);
  });
});

load();