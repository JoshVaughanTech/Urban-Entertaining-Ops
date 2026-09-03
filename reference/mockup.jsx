import { useState, useMemo } from "react";

/* ─────────────────────────── mock data (shared model) ─────────────────────────── */

const INGREDIENTS = {
  beef_eye: { name: "Beef eye fillet", unit: "kg", pack: 2.5, cost: 62, supplier: "Meatsmith" },
  salmon: { name: "Atlantic salmon fillet", unit: "kg", pack: 3, cost: 38, supplier: "Ocean Made" },
  chicken: { name: "Free-range chicken thigh", unit: "kg", pack: 5, cost: 14.5, supplier: "Meatsmith" },
  prawns: { name: "Tiger prawns (16/20)", unit: "kg", pack: 1, cost: 34, supplier: "Ocean Made" },
  puff: { name: "Butter puff pastry", unit: "kg", pack: 1.5, cost: 11, supplier: "Bidfood" },
  sourdough: { name: "Sourdough loaf", unit: "each", pack: 1, cost: 6.5, supplier: "Tivoli Road" },
  brie: { name: "Triple cream brie", unit: "kg", pack: 1, cost: 42, supplier: "Calendar Cheese" },
  manchego: { name: "Manchego 12mo", unit: "kg", pack: 3, cost: 39, supplier: "Calendar Cheese" },
  prosciutto: { name: "Prosciutto di Parma", unit: "kg", pack: 1, cost: 58, supplier: "Calendar Cheese" },
  figs: { name: "Fresh figs", unit: "kg", pack: 2, cost: 18, supplier: "Damian Pike" },
  rocket: { name: "Wild rocket", unit: "kg", pack: 1, cost: 16, supplier: "Damian Pike" },
  heirloom: { name: "Heirloom tomatoes", unit: "kg", pack: 4, cost: 12, supplier: "Damian Pike" },
  potato: { name: "Kipfler potatoes", unit: "kg", pack: 10, cost: 5.2, supplier: "Damian Pike" },
  lemon: { name: "Lemons", unit: "kg", pack: 5, cost: 4.8, supplier: "Damian Pike" },
  cream: { name: "Thickened cream", unit: "L", pack: 2, cost: 5.4, supplier: "Bidfood" },
  butter: { name: "Cultured butter", unit: "kg", pack: 5, cost: 15, supplier: "Bidfood" },
  choc: { name: "70% dark chocolate", unit: "kg", pack: 2.5, cost: 24, supplier: "Bidfood" },
  eggs: { name: "Free-range eggs", unit: "dozen", pack: 15, cost: 6.8, supplier: "Bidfood" },
  olive: { name: "Marinated olives", unit: "kg", pack: 2, cost: 19, supplier: "Bidfood" },
  crackers: { name: "Lavosh crackers", unit: "kg", pack: 1, cost: 22, supplier: "Bidfood" },
};

const RECIPES = {
  beef_crostini: { name: "Rare beef crostini, horseradish cream", yield: 40, items: [["beef_eye", 0.9], ["sourdough", 2], ["cream", 0.3], ["rocket", 0.1]] },
  salmon_blini: { name: "Cured salmon blini, crème fraîche", yield: 40, items: [["salmon", 0.8], ["cream", 0.4], ["eggs", 0.5], ["lemon", 0.2]] },
  prawn_skewer: { name: "Chargrilled prawn, lemon & chilli", yield: 30, items: [["prawns", 1.2], ["lemon", 0.3], ["butter", 0.1]] },
  chicken_pie: { name: "Mini chicken & leek pie", yield: 36, items: [["chicken", 1.4], ["puff", 0.9], ["cream", 0.3], ["eggs", 0.3]] },
  fig_tart: { name: "Fig, brie & prosciutto tartlet", yield: 30, items: [["figs", 0.6], ["brie", 0.4], ["prosciutto", 0.25], ["puff", 0.6]] },
  choc_tart: { name: "Dark chocolate tart, sea salt", yield: 24, items: [["choc", 0.5], ["cream", 0.5], ["butter", 0.3], ["eggs", 0.5]] },
  grazing: { name: "Grazing table (per 10 guests)", yield: 10, items: [["brie", 0.4], ["manchego", 0.4], ["prosciutto", 0.3], ["figs", 0.5], ["olive", 0.3], ["crackers", 0.4], ["sourdough", 2], ["heirloom", 0.6]] },
  beef_main: { name: "Eye fillet, kipfler, jus", yield: 10, items: [["beef_eye", 2], ["potato", 2], ["butter", 0.3], ["rocket", 0.2]] },
  salmon_main: { name: "Roast salmon, heirloom tomato, salsa verde", yield: 10, items: [["salmon", 1.8], ["heirloom", 1.2], ["lemon", 0.3], ["rocket", 0.2]] },
  entree_tomato: { name: "Heirloom tomato, burrata, basil", yield: 10, items: [["heirloom", 1.5], ["brie", 0.5], ["sourdough", 1]] },
  corp_sandwich: { name: "Gourmet sandwich selection", yield: 10, items: [["sourdough", 4], ["chicken", 0.8], ["heirloom", 0.5], ["rocket", 0.2], ["butter", 0.2]] },
};

const MENU_ITEMS = {
  beef_crostini: { recipe: "beef_crostini", perHead: 1.5 },
  salmon_blini: { recipe: "salmon_blini", perHead: 1.5 },
  prawn_skewer: { recipe: "prawn_skewer", perHead: 1 },
  chicken_pie: { recipe: "chicken_pie", perHead: 1.5 },
  fig_tart: { recipe: "fig_tart", perHead: 1 },
  choc_tart: { recipe: "choc_tart", perHead: 1 },
  grazing: { recipe: "grazing", perHead: 1 },
  beef_main: { recipe: "beef_main", perHead: 1 },
  salmon_main: { recipe: "salmon_main", perHead: 1 },
  entree_tomato: { recipe: "entree_tomato", perHead: 1 },
  corp_sandwich: { recipe: "corp_sandwich", perHead: 1 },
};

const PACKAGES = [
  {
    id: "cocktail_classic", name: "Cocktail — Classic", style: "cocktail", min: 30, max: 250,
    blurb: "Six canapés per guest over two hours, roaming service.",
    tiers: [[60, 68], [120, 62], [250, 56]],
    items: ["beef_crostini", "salmon_blini", "chicken_pie", "fig_tart"],
    includes: ["Wait staff (1 per 25 guests)", "Platters & service ware", "Setup and pack down"],
    staffRatio: 25, hours: 3,
  },
  {
    id: "cocktail_signature", name: "Cocktail — Signature", style: "cocktail", min: 30, max: 180,
    blurb: "Eight canapés including two substantial, dessert to finish.",
    tiers: [[60, 89], [120, 82], [180, 76]],
    items: ["beef_crostini", "salmon_blini", "prawn_skewer", "chicken_pie", "fig_tart", "choc_tart"],
    includes: ["Wait staff (1 per 20 guests)", "Platters & service ware", "Setup and pack down"],
    staffRatio: 20, hours: 4,
  },
  {
    id: "grazing", name: "Grazing Table", style: "grazing", min: 20, max: 150,
    blurb: "Styled table of cheese, charcuterie, fruit and breads.",
    tiers: [[50, 38], [150, 34]],
    items: ["grazing"],
    includes: ["Styling & props", "Setup and pack down"],
    staffRatio: 0, hours: 2,
  },
  {
    id: "seated_three", name: "Seated — Three Course", style: "seated", min: 20, max: 120,
    blurb: "Alternate drop entrée, main and dessert with full service.",
    tiers: [[40, 145], [80, 135], [120, 128]],
    items: ["entree_tomato", "beef_main", "salmon_main", "choc_tart"],
    includes: ["Wait staff (1 per 12 guests)", "Chef on site", "Crockery, cutlery, glassware"],
    staffRatio: 12, hours: 5,
  },
  {
    id: "corporate_lunch", name: "Corporate Lunch", style: "corporate", min: 10, max: 200,
    blurb: "Delivered sandwiches, salads and sweets for the boardroom.",
    tiers: [[30, 32], [200, 27]],
    items: ["corp_sandwich", "choc_tart"],
    includes: ["Delivery within 15km", "Disposable service ware"],
    staffRatio: 0, hours: 0,
  },
];

const ADDONS = [
  { id: "bar", name: "Bar service", price: 18, per: "head" },
  { id: "dessert", name: "Dessert station", price: 12, per: "head" },
  { id: "extra_hour", name: "Additional service hour", price: 380, per: "flat" },
  { id: "styling", name: "Table styling & florals", price: 650, per: "flat" },
];

const STAFF_RATE = 48;
const DIETARY = ["Vegetarian", "Vegan", "Gluten free", "Dairy free", "Halal", "Nut allergy"];
const STYLES = [["cocktail", "Cocktail"], ["seated", "Seated dinner"], ["grazing", "Grazing"], ["corporate", "Corporate"]];

const SEED_QUOTES = [
  { id: "UE-1042", client: "Harper & Co. Wedding", date: "2026-09-12", guests: 110, packageId: "cocktail_signature", perHead: 82, addons: ["bar"], status: "confirmed" },
  { id: "UE-1046", client: "Rothwell Partners — EOFY", date: "2026-09-11", guests: 60, packageId: "seated_three", perHead: 135, addons: [], status: "confirmed" },
  { id: "UE-1049", client: "Studio Nine launch", date: "2026-09-18", guests: 45, packageId: "grazing", perHead: 38, addons: ["styling"], status: "sent" },
];

/* ─────────────────────────── calculations ─────────────────────────── */

const tierPrice = (pkg, guests) => (pkg.tiers.find(([upTo]) => guests <= upTo) || pkg.tiers[pkg.tiers.length - 1])[1];

const recipeCostPerPortion = (rid) => {
  const r = RECIPES[rid];
  const total = r.items.reduce((s, [ing, qty]) => s + qty * INGREDIENTS[ing].cost, 0);
  return total / r.yield;
};

const foodCostPerHead = (pkg) =>
  pkg.items.reduce((s, mid) => s + recipeCostPerPortion(MENU_ITEMS[mid].recipe) * MENU_ITEMS[mid].perHead, 0);

const staffCost = (pkg, guests) => (pkg.staffRatio ? Math.ceil(guests / pkg.staffRatio) * pkg.hours * STAFF_RATE : 0);

const fitPackage = (pkg, ev) => {
  const issues = [];
  if (ev.style && pkg.style !== ev.style) issues.push("Different service style");
  if (ev.guests < pkg.min) issues.push(`Minimum ${pkg.min} guests`);
  if (ev.guests > pkg.max) issues.push(`Caps at ${pkg.max} guests`);
  if (ev.dietary.includes("Vegan") && pkg.id === "grazing") issues.push("Grazing has no vegan build yet");
  return issues;
};

const money = (n) => "$" + Math.round(n).toLocaleString("en-AU");
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });

const ingredientRollup = (quotes) => {
  const need = {};
  quotes.forEach((q) => {
    const pkg = PACKAGES.find((p) => p.id === q.packageId);
    pkg.items.forEach((mid) => {
      const mi = MENU_ITEMS[mid];
      const r = RECIPES[mi.recipe];
      const batches = (mi.perHead * q.guests) / r.yield;
      r.items.forEach(([ing, qty]) => {
        need[ing] = need[ing] || { qty: 0, events: new Set() };
        need[ing].qty += qty * batches;
        need[ing].events.add(q.id);
      });
    });
  });
  return Object.entries(need).map(([id, v]) => {
    const ing = INGREDIENTS[id];
    const packs = Math.ceil(v.qty / ing.pack);
    return { id, ...ing, needed: v.qty, packs, orderQty: packs * ing.pack, cost: packs * ing.pack * ing.cost, events: [...v.events] };
  });
};

/* ─────────────────────────── styles ─────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Mulish:wght@400;600;700&display=swap');
.ue{--bg:#F3F1EC;--paper:#FFFFFF;--line:#DDD8CE;--ink:#1F1D19;--muted:#7A756B;--green:#2F4A3A;--green-soft:#E6ECE7;--amber:#8A5A16;--amber-soft:#F5EBD8;--red:#8C3A2E;--red-soft:#F4E3DF;
  font-family:'Mulish',system-ui,sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;display:flex;font-size:13px;line-height:1.45}
.ue *{box-sizing:border-box}
.ue .serif{font-family:'Cormorant Garamond',Georgia,serif}
.ue nav{width:200px;background:var(--paper);border-right:1px solid var(--line);padding:22px 16px;display:flex;flex-direction:column;gap:2px;flex-shrink:0}
.ue nav .brand{font-size:24px;font-weight:600;letter-spacing:.01em;margin:0 6px 22px;line-height:1.1}
.ue nav .brand small{display:block;font-family:'Mulish';font-size:11px;color:var(--muted);font-weight:400;letter-spacing:0;margin-top:3px}
.ue nav button{text-align:left;padding:9px 10px;border:0;background:none;border-radius:6px;font:inherit;color:var(--muted);cursor:pointer;font-weight:600}
.ue nav button.on{background:var(--green);color:#fff}
.ue nav button:hover:not(.on){background:var(--bg)}
.ue main{flex:1;padding:26px 30px;min-width:0;overflow:auto}
.ue h1{font-size:30px;font-weight:500;margin:0 0 4px}
.ue .sub{color:var(--muted);margin:0 0 22px}
.ue .grid{display:grid;grid-template-columns:340px 1fr;gap:22px;align-items:start}
.ue .card{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:18px}
.ue .card h2{font-size:20px;font-weight:600;margin:0 0 12px}
.ue label{display:block;font-size:11.5px;font-weight:600;color:var(--muted);margin:0 0 4px}
.ue .f{margin-bottom:12px}
.ue input,.ue select,.ue textarea{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font:inherit;color:var(--ink);background:#FBFAF7}
.ue input:focus,.ue select:focus,.ue textarea:focus{outline:2px solid var(--green);outline-offset:-1px}
.ue .row{display:flex;gap:10px}
.ue .row>*{flex:1}
.ue .chips{display:flex;flex-wrap:wrap;gap:6px}
.ue .chip{padding:5px 10px;border-radius:99px;border:1px solid var(--line);background:#fff;font:inherit;font-size:12px;cursor:pointer;color:var(--ink)}
.ue .chip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.ue .pk{border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:8px;cursor:pointer;background:#fff;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.ue .pk.sel{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}
.ue .pk.bad{opacity:.55;cursor:default}
.ue .pk .name{font-size:17px;font-weight:600}
.ue .pk .blurb{color:var(--muted);margin-top:2px}
.ue .pk .price{text-align:right;white-space:nowrap}
.ue .pk .price b{font-size:18px;font-weight:600;font-family:'Cormorant Garamond',serif}
.ue .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-top:6px;margin-right:4px}
.ue .tag.ok{background:var(--green-soft);color:var(--green)}
.ue .tag.warn{background:var(--amber-soft);color:var(--amber)}
.ue .tag.bad{background:var(--red-soft);color:var(--red)}
.ue table{width:100%;border-collapse:collapse}
.ue th{text-align:left;font-size:11.5px;color:var(--muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)}
.ue td{padding:8px;border-bottom:1px solid #EEEAE2;vertical-align:middle}
.ue td.n,.ue th.n{text-align:right;font-variant-numeric:tabular-nums}
.ue td input{width:80px;text-align:right;padding:5px 8px}
.ue .total td{border-bottom:0;border-top:2px solid var(--ink);font-weight:700;font-size:15px}
.ue .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.ue .stat{background:var(--bg);border-radius:6px;padding:10px 12px}
.ue .stat span{font-size:11.5px;color:var(--muted);font-weight:600;display:block}
.ue .stat b{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:600}
.ue .btn{padding:9px 16px;border-radius:6px;border:1px solid var(--ink);background:var(--ink);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.ue .btn.ghost{background:#fff;color:var(--ink)}
.ue .btn:disabled{opacity:.4;cursor:default}
.ue .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.ue .empty{padding:40px;text-align:center;color:var(--muted)}
.ue .empty b{display:block;font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:var(--ink);margin-bottom:4px}
.ue .sup{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;padding:16px 8px 6px}
.ue .status{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.ue .status.confirmed{background:var(--green-soft);color:var(--green)}
.ue .status.sent{background:var(--amber-soft);color:var(--amber)}
.ue .status.draft{background:#EEEAE2;color:var(--muted)}
.ue .preview{background:#fff;border:1px solid var(--line);padding:32px 36px;border-radius:8px;max-width:640px}
.ue .preview h1{font-size:34px}
.ue .preview .meta{color:var(--muted);margin-bottom:22px}
.ue .preview ul{margin:8px 0 0 18px;padding:0;color:var(--muted)}
.ue .toggle{display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer}
.ue .toggle input{width:auto}
@media(max-width:900px){.ue{flex-direction:column}.ue nav{width:auto;flex-direction:row;flex-wrap:wrap;padding:12px}.ue nav .brand{width:100%;margin-bottom:8px}.ue .grid{grid-template-columns:1fr}}
`;

/* ─────────────────────────── quote builder ─────────────────────────── */

function QuoteBuilder({ onSave }) {
  const [ev, setEv] = useState({ client: "", date: "2026-10-17", guests: 80, style: "cocktail", hours: 3, venue: "", dietary: [] });
  const [sel, setSel] = useState(null);
  const [perHead, setPerHead] = useState(null);
  const [addons, setAddons] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [view, setView] = useState("build");

  const set = (k, v) => setEv((e) => ({ ...e, [k]: v }));
  const toggleDiet = (d) => set("dietary", ev.dietary.includes(d) ? ev.dietary.filter((x) => x !== d) : [...ev.dietary, d]);

  const ranked = useMemo(() =>
    PACKAGES.map((p) => ({ p, issues: fitPackage(p, ev) })).sort((a, b) => a.issues.length - b.issues.length), [ev]);

  const pkg = PACKAGES.find((p) => p.id === sel);
  const listPrice = pkg ? tierPrice(pkg, ev.guests) : 0;
  const price = perHead ?? listPrice;

  const lines = useMemo(() => {
    if (!pkg) return [];
    const L = [{ label: `${pkg.name} — ${ev.guests} guests`, qty: ev.guests, unit: price, editable: true }];
    addons.forEach((id) => {
      const a = ADDONS.find((x) => x.id === id);
      L.push({ label: a.name, qty: a.per === "head" ? ev.guests : 1, unit: a.price });
    });
    const extra = Math.max(0, ev.hours - pkg.hours);
    if (extra > 0 && pkg.staffRatio) L.push({ label: `Extended service (${extra}h × ${Math.ceil(ev.guests / pkg.staffRatio)} staff)`, qty: extra * Math.ceil(ev.guests / pkg.staffRatio), unit: STAFF_RATE * 1.6 });
    return L;
  }, [pkg, ev, price, addons]);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit, 0);
  const total = subtotal - discount;
  const food = pkg ? foodCostPerHead(pkg) * ev.guests : 0;
  const staff = pkg ? staffCost(pkg, ev.guests) : 0;
  const margin = total ? (total - food - staff) / total : 0;

  const save = (status) => {
    onSave({ id: "UE-" + (1050 + Math.floor(Math.random() * 40)), client: ev.client || "Untitled event", date: ev.date, guests: ev.guests, packageId: pkg.id, perHead: price, addons, status });
  };

  if (view === "preview" && pkg) return (
    <div>
      <div className="actions" style={{ justifyContent: "flex-start", marginBottom: 16 }}>
        <button className="btn ghost" onClick={() => setView("build")}>Back to editing</button>
        <button className="btn" onClick={() => save("sent")}>Send to client</button>
      </div>
      <div className="preview">
        <div className="serif" style={{ fontSize: 14, color: "var(--muted)" }}>Urban Entertaining</div>
        <h1 className="serif">Quotation</h1>
        <div className="meta">{ev.client || "Your event"} · {fmtDate(ev.date)} · {ev.guests} guests{ev.venue ? ` · ${ev.venue}` : ""}</div>
        <table>
          <tbody>
            {lines.map((l, i) => <tr key={i}><td>{l.label}</td><td className="n">{l.qty > 1 ? `${l.qty} × ${money(l.unit)}` : ""}</td><td className="n">{money(l.qty * l.unit)}</td></tr>)}
            {discount > 0 && <tr><td>Discount</td><td /><td className="n">−{money(discount)}</td></tr>}
            <tr className="total"><td>Total (inc. GST)</td><td /><td className="n">{money(total)}</td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: 20 }}><b>Included in your package</b></p>
        <ul>{pkg.includes.map((i) => <li key={i}>{i}</li>)}</ul>
        <p style={{ marginTop: 16 }}><b>Menu</b></p>
        <ul>{pkg.items.map((m) => <li key={m}>{RECIPES[MENU_ITEMS[m].recipe].name}</li>)}</ul>
        {ev.dietary.length > 0 && <p style={{ color: "var(--muted)", marginTop: 16 }}>Dietary requirements catered for: {ev.dietary.join(", ")}.</p>}
        <p style={{ color: "var(--muted)", marginTop: 24, fontSize: 12 }}>Valid for 14 days. A 30% deposit confirms your date.</p>
      </div>
    </div>
  );

  return (
    <div className="grid">
      <div className="card">
        <h2 className="serif">Event details</h2>
        <div className="f"><label>Client</label><input value={ev.client} onChange={(e) => set("client", e.target.value)} placeholder="e.g. Harper & Co. wedding" /></div>
        <div className="row">
          <div className="f"><label>Date</label><input type="date" value={ev.date} onChange={(e) => set("date", e.target.value)} /></div>
          <div className="f"><label>Guests</label><input type="number" value={ev.guests} onChange={(e) => set("guests", +e.target.value || 0)} /></div>
        </div>
        <div className="row">
          <div className="f"><label>Service style</label>
            <select value={ev.style} onChange={(e) => set("style", e.target.value)}>{STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="f"><label>Duration (hours)</label><input type="number" value={ev.hours} onChange={(e) => set("hours", +e.target.value || 0)} /></div>
        </div>
        <div className="f"><label>Venue</label><input value={ev.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Suburb or venue name" /></div>
        <div className="f"><label>Dietary requirements</label>
          <div className="chips">{DIETARY.map((d) => <button key={d} className={"chip" + (ev.dietary.includes(d) ? " on" : "")} onClick={() => toggleDiet(d)}>{d}</button>)}</div></div>
      </div>

      <div>
        <div className="card" style={{ marginBottom: 18 }}>
          <h2 className="serif">Packages that fit</h2>
          {ranked.map(({ p, issues }) => {
            const hard = issues.some((i) => i.startsWith("Caps") || i.startsWith("Minimum") || i.startsWith("Grazing"));
            return (
              <div key={p.id} className={"pk" + (sel === p.id ? " sel" : "") + (hard ? " bad" : "")} onClick={() => { if (!hard) { setSel(p.id); setPerHead(null); } }}>
                <div>
                  <div className="name serif">{p.name}</div>
                  <div className="blurb">{p.blurb}</div>
                  <div>
                    {issues.length === 0 && <span className="tag ok">Fits this event</span>}
                    {issues.map((i) => <span key={i} className={"tag " + (hard ? "bad" : "warn")}>{i}</span>)}
                  </div>
                </div>
                <div className="price"><b>{money(tierPrice(p, ev.guests))}</b><div style={{ color: "var(--muted)", fontSize: 11.5 }}>per head</div></div>
              </div>
            );
          })}
        </div>

        {pkg ? (
          <div className="card">
            <h2 className="serif">Quote</h2>
            <div className="stats">
              <div className="stat"><span>Quote total</span><b>{money(total)}</b></div>
              <div className="stat"><span>Food + staff cost</span><b>{money(food + staff)}</b></div>
              <div className="stat"><span>Gross margin</span><b style={{ color: margin < 0.55 ? "var(--red)" : "var(--green)" }}>{Math.round(margin * 100)}%</b></div>
            </div>
            <table>
              <thead><tr><th>Line</th><th className="n">Qty</th><th className="n">Unit</th><th className="n">Amount</th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.label}{l.editable && price !== listPrice && <span className="tag warn" style={{ marginLeft: 8, marginTop: 0 }}>List {money(listPrice)}</span>}</td>
                    <td className="n">{l.qty}</td>
                    <td className="n">{l.editable ? <input type="number" value={price} onChange={(e) => setPerHead(+e.target.value)} /> : money(l.unit)}</td>
                    <td className="n">{money(l.qty * l.unit)}</td>
                  </tr>
                ))}
                <tr><td>Discount</td><td /><td className="n"><input type="number" value={discount} onChange={(e) => setDiscount(+e.target.value || 0)} /></td><td className="n">{discount ? "−" + money(discount) : "—"}</td></tr>
                <tr className="total"><td>Total inc. GST</td><td /><td /><td className="n">{money(total)}</td></tr>
              </tbody>
            </table>
            <div style={{ marginTop: 14 }}>
              <label>Add-ons</label>
              {ADDONS.map((a) => (
                <label key={a.id} className="toggle" style={{ color: "var(--ink)", fontWeight: 400, fontSize: 13 }}>
                  <input type="checkbox" checked={addons.includes(a.id)} onChange={() => setAddons(addons.includes(a.id) ? addons.filter((x) => x !== a.id) : [...addons, a.id])} />
                  {a.name} <span style={{ color: "var(--muted)" }}>— {money(a.price)} {a.per === "head" ? "per head" : "flat"}</span>
                </label>
              ))}
            </div>
            <div className="actions">
              <button className="btn ghost" onClick={() => save("draft")}>Save draft</button>
              <button className="btn" onClick={() => setView("preview")}>Preview client quote</button>
            </div>
          </div>
        ) : (
          <div className="card empty"><b>Choose a package</b>Select a package above to build the quote.</div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── quotes list ─────────────────────────── */

function Quotes({ quotes, setQuotes, onNew }) {
  const flip = (id, status) => setQuotes(quotes.map((q) => (q.id === id ? { ...q, status } : q)));
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 className="serif" style={{ margin: 0 }}>All quotes</h2>
        <button className="btn" onClick={onNew}>New quote</button>
      </div>
      <table>
        <thead><tr><th>Ref</th><th>Client</th><th>Date</th><th className="n">Guests</th><th>Package</th><th className="n">Total</th><th>Status</th><th /></tr></thead>
        <tbody>
          {quotes.map((q) => {
            const p = PACKAGES.find((x) => x.id === q.packageId);
            const addonTotal = q.addons.reduce((s, id) => { const a = ADDONS.find((x) => x.id === id); return s + a.price * (a.per === "head" ? q.guests : 1); }, 0);
            return (
              <tr key={q.id}>
                <td>{q.id}</td><td>{q.client}</td><td>{fmtDate(q.date)}</td><td className="n">{q.guests}</td><td>{p.name}</td>
                <td className="n">{money(q.guests * q.perHead + addonTotal)}</td>
                <td><span className={"status " + q.status}>{q.status}</span></td>
                <td className="n">{q.status !== "confirmed" && <button className="btn ghost" style={{ padding: "4px 10px" }} onClick={() => flip(q.id, "confirmed")}>Mark confirmed</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────── ordering ─────────────────────────── */

function Ordering({ quotes }) {
  const [from, setFrom] = useState("2026-09-07");
  const [to, setTo] = useState("2026-09-20");
  const [ordered, setOrdered] = useState({});
  const inWindow = quotes.filter((q) => q.status === "confirmed" && q.date >= from && q.date <= to);
  const rollup = useMemo(() => ingredientRollup(inWindow), [inWindow]);
  const bySupplier = rollup.reduce((m, r) => ((m[r.supplier] = m[r.supplier] || []).push(r), m), {});
  const totalCost = rollup.reduce((s, r) => s + r.cost, 0);

  return (
    <div className="grid">
      <div>
        <div className="card" style={{ marginBottom: 18 }}>
          <h2 className="serif">Order window</h2>
          <div className="row">
            <div className="f"><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="f"><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <label>Confirmed events in window</label>
          {inWindow.length === 0 && <div style={{ color: "var(--muted)" }}>No confirmed events. Confirm a quote to see what it needs.</div>}
          {inWindow.map((q) => (
            <div key={q.id} style={{ padding: "8px 0", borderBottom: "1px solid #EEEAE2" }}>
              <div style={{ fontWeight: 600 }}>{q.client}</div>
              <div style={{ color: "var(--muted)" }}>{fmtDate(q.date)} · {q.guests} guests · {PACKAGES.find((p) => p.id === q.packageId).name}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="stats" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
            <div className="stat"><span>Lines to order</span><b>{rollup.length}</b></div>
            <div className="stat"><span>Estimated spend</span><b>{money(totalCost)}</b></div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="serif">Order list by supplier</h2>
        {rollup.length === 0 ? <div className="empty"><b>Nothing to order yet</b>Widen the window or confirm a quote.</div> : (
          <table>
            <thead><tr><th /><th>Ingredient</th><th className="n">Needed</th><th className="n">Order</th><th className="n">Cost</th><th>For</th></tr></thead>
            <tbody>
              {Object.entries(bySupplier).map(([sup, rows]) => (
                <>
                  <tr key={sup}><td colSpan={6} className="sup">{sup} <span style={{ fontFamily: "Mulish", fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>— {money(rows.reduce((s, r) => s + r.cost, 0))}</span></td></tr>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ opacity: ordered[r.id] ? 0.45 : 1 }}>
                      <td><input type="checkbox" style={{ width: "auto" }} checked={!!ordered[r.id]} onChange={() => setOrdered({ ...ordered, [r.id]: !ordered[r.id] })} /></td>
                      <td>{r.name}</td>
                      <td className="n">{r.needed.toFixed(1)} {r.unit}</td>
                      <td className="n"><b>{r.packs} × {r.pack}{r.unit}</b></td>
                      <td className="n">{money(r.cost)}</td>
                      <td style={{ color: "var(--muted)", fontSize: 11.5 }}>{r.events.join(", ")}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
        {rollup.length > 0 && <div className="actions"><button className="btn ghost">Export by supplier</button><button className="btn">Send purchase orders</button></div>}
      </div>
    </div>
  );
}

/* ─────────────────────────── packages & recipes ─────────────────────────── */

const cents = (n) => "$" + n.toFixed(2);

function Packages() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
      {PACKAGES.map((p) => {
        const food = foodCostPerHead(p);
        const lowest = p.tiers[p.tiers.length - 1][1];
        const pct = food / lowest;
        return (
          <div key={p.id} className="card">
            <h2 className="serif" style={{ marginBottom: 2 }}>{p.name}</h2>
            <div style={{ color: "var(--muted)", marginBottom: 10 }}>{p.blurb} <span className="tag ok" style={{ marginTop: 0 }}>{p.min}–{p.max} guests</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {p.tiers.map(([upTo, price], i) => (
                <div key={upTo} className="stat" style={{ padding: "6px 10px", textAlign: "center" }}>
                  <b style={{ fontSize: 19 }}>${price}</b>
                  <span>{i ? `${p.tiers[i - 1][0] + 1}–${upTo}` : `up to ${upTo}`} guests</span>
                </div>
              ))}
            </div>
            <table>
              <tbody>
                {p.items.map((m) => (
                  <tr key={m}>
                    <td>{RECIPES[MENU_ITEMS[m].recipe].name}<div style={{ color: "var(--muted)", fontSize: 11.5 }}>{MENU_ITEMS[m].perHead} per guest</div></td>
                    <td className="n">{cents(recipeCostPerPortion(MENU_ITEMS[m].recipe) * MENU_ITEMS[m].perHead)}</td>
                  </tr>
                ))}
                <tr className="total" style={{ fontSize: 13 }}>
                  <td>Food cost per guest</td>
                  <td className="n">{cents(food)} <span className={"tag " + (pct > 0.3 ? "warn" : "ok")} style={{ marginTop: 0 }}>{Math.round(pct * 100)}% of lowest tier</span></td>
                </tr>
              </tbody>
            </table>
            <div style={{ color: "var(--muted)", marginTop: 10, fontSize: 12 }}>{p.includes.join(" · ")}</div>
          </div>
        );
      })}
    </div>
  );
}

function Recipes() {
  const [tab, setTab] = useState("recipes");
  const used = {};
  Object.values(RECIPES).forEach((r) => r.items.forEach(([i]) => (used[i] = used[i] || []).push(r.name.split(",")[0])));
  const bySup = {};
  Object.entries(INGREDIENTS).forEach(([id, i]) => (bySup[i.supplier] = bySup[i.supplier] || []).push([id, i]));

  return (
    <div>
      <div className="chips" style={{ marginBottom: 16 }}>
        <button className={"chip" + (tab === "recipes" ? " on" : "")} onClick={() => setTab("recipes")}>Recipes</button>
        <button className={"chip" + (tab === "ingredients" ? " on" : "")} onClick={() => setTab("ingredients")}>Ingredients by supplier</button>
      </div>
      {tab === "recipes" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
          {Object.entries(RECIPES).map(([id, r]) => {
            const tot = r.items.reduce((s, [i, q]) => s + q * INGREDIENTS[i].cost, 0);
            return (
              <div key={id} className="card">
                <h2 className="serif" style={{ fontSize: 18, marginBottom: 0 }}>{r.name}</h2>
                <div style={{ color: "var(--muted)", marginBottom: 8 }}>Batch yields {r.yield} portions</div>
                <table>
                  <tbody>
                    {r.items.map(([i, q]) => <tr key={i}><td>{INGREDIENTS[i].name}</td><td className="n">{q} {INGREDIENTS[i].unit}</td><td className="n">{cents(q * INGREDIENTS[i].cost)}</td></tr>)}
                    <tr className="total" style={{ fontSize: 13 }}><td>Batch cost</td><td /><td className="n">{cents(tot)}</td></tr>
                    <tr style={{ fontWeight: 700 }}><td style={{ borderBottom: 0 }}>Per portion</td><td style={{ borderBottom: 0 }} /><td className="n" style={{ borderBottom: 0 }}>{cents(tot / r.yield)}</td></tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <table>
            <thead><tr><th>Ingredient</th><th className="n">Unit</th><th className="n">Pack</th><th className="n">Cost / unit</th><th>Used in</th></tr></thead>
            <tbody>
              {Object.entries(bySup).map(([s, rows]) => (
                <>
                  <tr key={s}><td colSpan={5} className="sup">{s}</td></tr>
                  {rows.map(([id, i]) => (
                    <tr key={id}>
                      <td>{i.name}</td><td className="n">{i.unit}</td><td className="n">{i.pack} {i.unit}</td><td className="n">{cents(i.cost)}</td>
                      <td style={{ color: "var(--muted)", fontSize: 11.5 }}>{(used[id] || []).join(", ")}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── shell ─────────────────────────── */

export default function App() {
  const [tab, setTab] = useState("new");
  const [quotes, setQuotes] = useState(SEED_QUOTES);
  const [saved, setSaved] = useState(null);

  const onSave = (q) => { setQuotes([q, ...quotes]); setSaved(q); setTab("quotes"); };

  const titles = {
    new: ["New quote", "Enter the event, pick the package that fits, adjust the numbers."],
    quotes: ["Quotes", saved ? `${saved.id} saved as ${saved.status}.` : "Every quote, from draft to confirmed."],
    ordering: ["Ordering", "Everything the confirmed events need, rolled up and rounded to supplier packs."],
    packages: ["Packages", "What Urban Entertaining sells, with live food cost against each price tier."],
    recipes: ["Recipes", "Every recipe costed from current ingredient prices."],
  };

  return (
    <div className="ue">
      <style>{CSS}</style>
      <nav>
        <div className="brand serif">Urban Entertaining<small>Operations</small></div>
        <button className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>New quote</button>
        <button className={tab === "quotes" ? "on" : ""} onClick={() => setTab("quotes")}>Quotes</button>
        <button className={tab === "ordering" ? "on" : ""} onClick={() => setTab("ordering")}>Ordering</button>
        <div style={{ flex: 1 }} />
        <button className={tab === "packages" ? "on" : ""} onClick={() => setTab("packages")}>Packages</button>
        <button className={tab === "recipes" ? "on" : ""} onClick={() => setTab("recipes")}>Recipes</button>
      </nav>
      <main>
        <h1 className="serif">{titles[tab][0]}</h1>
        <p className="sub">{titles[tab][1]}</p>
        {tab === "new" && <QuoteBuilder onSave={onSave} />}
        {tab === "quotes" && <Quotes quotes={quotes} setQuotes={setQuotes} onNew={() => setTab("new")} />}
        {tab === "ordering" && <Ordering quotes={quotes} />}
        {tab === "packages" && <Packages />}
        {tab === "recipes" && <Recipes />}
      </main>
    </div>
  );
}
