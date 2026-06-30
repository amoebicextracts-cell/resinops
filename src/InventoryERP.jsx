import { useState, useEffect } from "react";

const ITEM_CATS = [
  "Packaging","Extraction Solvents","Extraction Consumables","Post-Harvest Supplies",
  "Pre-Roll Supplies","Vape Hardware","Edible Ingredients","Lab Supplies",
  "Nutrients & Amendments","Growing Media","IPM Products","Cultivation Supplies",
  "Cleaning & Sanitation","Other",
];
const UOMS = ["each","g","kg","lb","oz","gal","L","ml","case","sheet","ft","roll"];
const VAL_METHODS = [
  {v:"fifo",   l:"FIFO (First In First Out)"},
  {v:"average",l:"Average Cost"},
  {v:"last",   l:"Last Purchase Price"},
];


// ── CSV import/export helpers ───────────────────────────────────────────────
const CSV_HEADERS = ["Item Name","Category","Unit of Measure","Current Stock","Unit Cost","Reorder At","Reorder Qty","Valuation Method"];

function downloadTemplate() {
  const sample = [
    CSV_HEADERS.join(","),
    'n-Butane (Extraction Grade),Extraction Solvents,lb,50,12.50,50,200,fifo',
    'Child-Resistant Jar — 3.5g,Packaging,each,1000,0.45,500,2000,average',
  ].join("\n");
  const blob = new Blob([sample], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ResinOps-Inventory-Template.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["File appears empty or has no data rows."] };
  const headerLine = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g,""));
  const rows = []; const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g,""));
    if (cols.length < 3 || !cols[0]) continue;
    const [name, cat, uom, stock, cost, reorderAt, reorderQty, vm] = cols;
    rows.push({
      n: name, cat: cat || "Other", uom: uom || "each",
      stock: parseFloat(stock) || 0, cost: parseFloat(cost) || 0,
      reorderAt: parseFloat(reorderAt) || 0, reorderQty: parseFloat(reorderQty) || 0,
      vm: ["fifo","average","last"].includes((vm||"").toLowerCase()) ? vm.toLowerCase() : "average",
    });
  }
  if (!rows.length) errors.push("No valid rows found. Check that columns match the template.");
  return { rows, errors };
}

const DEFAULT_ITEMS = [
  {id:"i1",  n:"Child-Resistant Jar — 3.5g", cat:"Packaging",              uom:"each", stock:0, reorderAt:500,  reorderQty:2000, vm:"average", lots:[]},
  {id:"i2",  n:"Child-Resistant Jar — 7g",   cat:"Packaging",              uom:"each", stock:0, reorderAt:250,  reorderQty:1000, vm:"average", lots:[]},
  {id:"i3",  n:"Child-Resistant Jar — 1g",   cat:"Packaging",              uom:"each", stock:0, reorderAt:500,  reorderQty:2000, vm:"average", lots:[]},
  {id:"i4",  n:"Mylar Bag — 3.5g",           cat:"Packaging",              uom:"each", stock:0, reorderAt:500,  reorderQty:2000, vm:"average", lots:[]},
  {id:"i5",  n:"Product Label",              cat:"Packaging",              uom:"each", stock:0, reorderAt:500,  reorderQty:2000, vm:"average", lots:[]},
  {id:"i6",  n:"Exit Bag",                   cat:"Packaging",              uom:"each", stock:0, reorderAt:200,  reorderQty:1000, vm:"average", lots:[]},
  {id:"i7",  n:"n-Butane (Extraction Grade)",cat:"Extraction Solvents",    uom:"lb",   stock:0, reorderAt:50,   reorderQty:200,  vm:"fifo",    lots:[]},
  {id:"i8",  n:"Propane (Extraction Grade)", cat:"Extraction Solvents",    uom:"lb",   stock:0, reorderAt:20,   reorderQty:100,  vm:"fifo",    lots:[]},
  {id:"i9",  n:"Ethanol (Lab Grade)",        cat:"Extraction Solvents",    uom:"gal",  stock:0, reorderAt:5,    reorderQty:25,   vm:"fifo",    lots:[]},
  {id:"i10", n:"Isopropyl Alcohol 99%",      cat:"Cleaning & Sanitation",  uom:"gal",  stock:0, reorderAt:2,    reorderQty:10,   vm:"average", lots:[]},
  {id:"i11", n:"Filter Paper — Whatman #1",  cat:"Extraction Consumables", uom:"each", stock:0, reorderAt:50,   reorderQty:200,  vm:"average", lots:[]},
  {id:"i12", n:"Pre-Roll Cone — 1g",         cat:"Pre-Roll Supplies",      uom:"each", stock:0, reorderAt:2000, reorderQty:5000, vm:"average", lots:[]},
  {id:"i13", n:"Pre-Roll Cone — 0.5g",       cat:"Pre-Roll Supplies",      uom:"each", stock:0, reorderAt:2000, reorderQty:5000, vm:"average", lots:[]},
  {id:"i14", n:"Pre-Roll Tube",              cat:"Pre-Roll Supplies",      uom:"each", stock:0, reorderAt:2000, reorderQty:5000, vm:"average", lots:[]},
  {id:"i15", n:"Filter Tips",               cat:"Pre-Roll Supplies",      uom:"each", stock:0, reorderAt:5000, reorderQty:10000,vm:"average", lots:[]},
  {id:"i16", n:"510 Cartridge — 1g",         cat:"Vape Hardware",          uom:"each", stock:0, reorderAt:200,  reorderQty:1000, vm:"fifo",    lots:[]},
  {id:"i17", n:"510 Cartridge — 0.5g",       cat:"Vape Hardware",          uom:"each", stock:0, reorderAt:200,  reorderQty:1000, vm:"fifo",    lots:[]},
  {id:"i18", n:"AIO Disposable — 2g",        cat:"Vape Hardware",          uom:"each", stock:0, reorderAt:100,  reorderQty:500,  vm:"fifo",    lots:[]},
  {id:"i19", n:"Fabric Pot — 5 gal",         cat:"Cultivation Supplies",   uom:"each", stock:0, reorderAt:50,   reorderQty:200,  vm:"average", lots:[]},
  {id:"i20", n:"Fabric Pot — 15 gal",        cat:"Cultivation Supplies",   uom:"each", stock:0, reorderAt:50,   reorderQty:200,  vm:"average", lots:[]},
  {id:"i21", n:"Coco Coir",                  cat:"Growing Media",          uom:"kg",   stock:0, reorderAt:50,   reorderQty:200,  vm:"average", lots:[]},
  {id:"i22", n:"Perlite",                    cat:"Growing Media",          uom:"L",    stock:0, reorderAt:50,   reorderQty:200,  vm:"average", lots:[]},
  {id:"i23", n:"pH Up",                      cat:"Nutrients & Amendments", uom:"L",    stock:0, reorderAt:2,    reorderQty:10,   vm:"average", lots:[]},
  {id:"i24", n:"pH Down",                    cat:"Nutrients & Amendments", uom:"L",    stock:0, reorderAt:2,    reorderQty:10,   vm:"average", lots:[]},
  {id:"i25", n:"Base Nutrients — Grow",      cat:"Nutrients & Amendments", uom:"L",    stock:0, reorderAt:5,    reorderQty:20,   vm:"average", lots:[]},
  {id:"i26", n:"Base Nutrients — Bloom",     cat:"Nutrients & Amendments", uom:"L",    stock:0, reorderAt:5,    reorderQty:20,   vm:"average", lots:[]},
  {id:"i27", n:"Compliance Sample Bag",      cat:"Lab Supplies",           uom:"each", stock:0, reorderAt:50,   reorderQty:200,  vm:"average", lots:[]},
  {id:"i28", n:"Trim Bag — Large",           cat:"Post-Harvest Supplies",  uom:"each", stock:0, reorderAt:20,   reorderQty:100,  vm:"average", lots:[]},
];

// Cost helpers
function itemCost(item) {
  if (!item.lots?.length) return 0;
  const active = item.lots.filter(l => l.remaining > 0);
  if (!active.length) return item.lastCost || 0;
  if (item.vm === "last") return [...active].sort((a,b) => new Date(b.date)-new Date(a.date))[0]?.costPerUnit || 0;
  if (item.vm === "average") {
    const tv = active.reduce((a,l) => a+l.remaining*l.costPerUnit, 0);
    const tq = active.reduce((a,l) => a+l.remaining, 0);
    return tq > 0 ? tv/tq : 0;
  }
  // FIFO — cost of next unit to be consumed
  return [...active].sort((a,b) => new Date(a.date)-new Date(b.date))[0]?.costPerUnit || 0;
}

function itemStock(item) {
  return (item.lots||[]).reduce((a,l) => a + (l.remaining||0), 0);
}

function fmtC(n) { return "$"+Number(n||0).toFixed(2); }
function fmtN(n) { return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2}); }

const CSS = `
  .erp-wrap{padding:24px;flex:1;overflow-y:auto;}
  .erp-tabs{display:flex;gap:2px;margin-bottom:18px;background:var(--surface-2);border-radius:8px;padding:3px;}
  .erp-tab{flex:1;padding:7px 10px;border:none;border-radius:6px;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:var(--text-2);background:none;transition:all 0.15s;}
  .erp-tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,0.2);}
  .erp-card{background:var(--surface);border:1px solid var(--border-2);border-radius:10px;padding:18px;margin-bottom:16px;}
  .erp-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;}
  .erp-inp:focus{outline:none;border-color:var(--accent);}
  .erp-sel{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:7px 10px;box-sizing:border-box;cursor:pointer;}
  .erp-lbl{font-size:11px;color:var(--text-2);display:block;margin-bottom:3px;}
  .erp-btn{border:none;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-weight:600;font-size:12px;padding:7px 14px;transition:opacity 0.15s;}
  .erp-btn:hover{opacity:0.85;}
  .erp-primary{background:var(--accent);color:#fff;}
  .erp-secondary{background:var(--surface-2);border:1px solid var(--border-2)!important;color:var(--text-2);}
  .erp-danger{background:rgba(200,74,74,0.1);border:1px solid rgba(200,74,74,0.3)!important;color:var(--danger);padding:3px 8px;font-size:11px;border-radius:5px;border:none;cursor:pointer;font-family:'Inter',sans-serif;}
  .erp-tbl{width:100%;border-collapse:collapse;font-size:12px;}
  .erp-tbl th{text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);border-bottom:1px solid var(--border);background:var(--surface-2);}
  .erp-tbl td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--text-2);vertical-align:middle;}
  .erp-tbl tr:last-child td{border-bottom:none;}
  .erp-num{width:80px;background:var(--surface-2);border:1px solid var(--border-2);border-radius:6px;color:var(--text);font-family:monospace;font-size:12px;padding:3px 6px;text-align:right;}
  .erp-num:focus{outline:none;border-color:var(--accent);}
  .stock-low{color:var(--danger);font-weight:700;}
  .stock-ok{color:var(--accent-2);}
  .stock-warn{color:var(--amber);}
  .po-status{font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;}
  .po-draft{background:rgba(100,100,100,0.15);color:var(--text-3);}
  .po-sent{background:rgba(200,150,58,0.15);color:var(--amber);}
  .po-received{background:rgba(74,124,89,0.2);color:var(--accent-2);}
  .po-partial{background:rgba(90,120,200,0.15);color:#7090f0;}
`;

const EMPTY_ITEM = {n:"",cat:"Packaging",uom:"each",reorderAt:"100",reorderQty:"500",vm:"average",notes:""};
const EMPTY_VENDOR = {n:"",contact:"",phone:"",email:"",leadDays:"7",notes:""};
const EMPTY_PO = {vendorId:"",date:"",items:[],notes:""};

export default function InventoryERP() {
  const [tab, setTab] = useState("items");
  const [items, setItems] = useState(() => { try { const s=JSON.parse(localStorage.getItem("resinops_inventory")||"[]"); return s.length?s:DEFAULT_ITEMS; } catch { return DEFAULT_ITEMS; } });
  const [vendors, setVendors] = useState(() => { try { return JSON.parse(localStorage.getItem("resinops_vendors")||"[]"); } catch { return []; } });
  const [pos, setPOs] = useState(() => { try { return JSON.parse(localStorage.getItem("resinops_pos")||"[]"); } catch { return []; } });
  const [itemForm, setItemForm] = useState(null);
  const [vendorForm, setVendorForm] = useState(null);
  const [poForm, setPoForm] = useState(null);
  const [receiveModal, setReceiveModal] = useState(null); // {po, receiving: {itemId, qty, cost}}
  const [adjustModal, setAdjustModal] = useState(null); // {item}
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [csvPreview, setCsvPreview] = useState(null); // {rows, errors}
  const [csvFileName, setCsvFileName] = useState("");

  function handleCSVFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows, errors } = parseCSV(ev.target.result);
      setCsvPreview({ rows, errors });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function confirmCSVImport() {
    if (!csvPreview || !csvPreview.rows.length) return;
    const newItems = csvPreview.rows.map(r => {
      const lot = r.stock > 0 ? [{ id:"lot"+Date.now()+Math.random(), date:new Date().toISOString().split("T")[0], qty:r.stock, remaining:r.stock, costPerUnit:r.cost, poId:"csv_import" }] : [];
      return { id:"i"+Date.now()+Math.random(), n:r.n, cat:r.cat, uom:r.uom, reorderAt:r.reorderAt, reorderQty:r.reorderQty, vm:r.vm, notes:"Imported from CSV", lots:lot, lastCost:r.cost };
    });
    setItems(p => [...p, ...newItems]);
    setCsvPreview(null); setCsvFileName("");
  }

  useEffect(() => { localStorage.setItem("resinops_inventory", JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem("resinops_vendors", JSON.stringify(vendors)); }, [vendors]);
  useEffect(() => { localStorage.setItem("resinops_pos", JSON.stringify(pos)); }, [pos]);

  const setIF = (k,v) => setItemForm(f=>({...f,[k]:v}));
  const setVF = (k,v) => setVendorForm(f=>({...f,[k]:v}));

  // Item CRUD
  function saveItem() {
    if (!itemForm.n?.trim()) { setErr("Enter an item name."); return; }
    const item = { id:itemForm.id||"i"+Date.now(), n:itemForm.n.trim(), cat:itemForm.cat, uom:itemForm.uom,
      reorderAt:parseFloat(itemForm.reorderAt)||0, reorderQty:parseFloat(itemForm.reorderQty)||0,
      vm:itemForm.vm, notes:itemForm.notes||"",
      lots: itemForm.lots||[], lastCost: itemForm.lastCost||0 };
    if (itemForm.id) setItems(p=>p.map(x=>x.id===itemForm.id?item:x));
    else setItems(p=>[...p,item]);
    setItemForm(null); setErr("");
  }
  function removeItem(id) { setItems(p=>p.filter(x=>x.id!==id)); }

  // Vendor CRUD
  function saveVendor() {
    if (!vendorForm.n?.trim()) { setErr("Enter a vendor name."); return; }
    const v = { id:vendorForm.id||"v"+Date.now(), ...vendorForm, n:vendorForm.n.trim() };
    if (vendorForm.id) setVendors(p=>p.map(x=>x.id===vendorForm.id?v:x));
    else setVendors(p=>[...p,v]);
    setVendorForm(null); setErr("");
  }

  // PO creation
  function openNewPO() {
    setPoForm({id:"po"+Date.now(), poNum:"PO-"+String(pos.length+1).padStart(4,"0"),
      vendorId:vendors[0]?.id||"", date:new Date().toISOString().split("T")[0],
      expectedDelivery:"", status:"draft",
      items:[], notes:""});
  }
  function addPOLine() {
    setPoForm(f=>({...f, items:[...f.items,{itemId:"",qty:"",unitCost:""}]}));
  }
  function setPOLine(i,k,v) {
    setPoForm(f=>({...f, items:f.items.map((l,idx)=>idx===i?{...l,[k]:v}:l)}));
  }
  function savePO() {
    if (!poForm.vendorId) { setErr("Select a vendor."); return; }
    if (!poForm.items.length) { setErr("Add at least one item."); return; }
    const po = {...poForm, items:poForm.items.map(l=>({...l, qty:parseFloat(l.qty)||0, unitCost:parseFloat(l.unitCost)||0, receivedQty:0}))};
    setPOs(p=>[...p.filter(x=>x.id!==po.id),po]);
    setPoForm(null); setErr("");
  }

  // Receive PO
  function openReceive(po) {
    setReceiveModal({po, lines: po.items.map(l=>({...l, receiveNow:String(Math.max(0,l.qty-(l.receivedQty||0)))}))});
  }
  function confirmReceive() {
    const {po, lines} = receiveModal;
    const newItems = [...items];
    const newPOItems = [...po.items];
    lines.forEach((l,i) => {
      const qty = parseFloat(l.receiveNow)||0;
      if (!qty) return;
      const itemIdx = newItems.findIndex(x=>x.id===l.itemId);
      if (itemIdx>=0) {
        const lot = { id:"lot"+Date.now()+i, date:po.date, qty, remaining:qty, costPerUnit:l.unitCost, poId:po.id };
        newItems[itemIdx] = {...newItems[itemIdx], lots:[...(newItems[itemIdx].lots||[]),lot], lastCost:l.unitCost };
      }
      newPOItems[i] = {...newPOItems[i], receivedQty:(newPOItems[i].receivedQty||0)+qty};
    });
    const allReceived = newPOItems.every(l => (l.receivedQty||0) >= l.qty);
    const anyReceived = newPOItems.some(l => (l.receivedQty||0) > 0);
    const status = allReceived?"received":anyReceived?"partial":"sent";
    setPOs(p=>p.map(x=>x.id===po.id?{...x,items:newPOItems,status}:x));
    setItems(newItems);
    setReceiveModal(null);
  }

  // Manual stock adjustment
  function confirmAdjust() {
    const {item, adjQty, adjCost, adjNote} = adjustModal;
    const qty = parseFloat(adjQty)||0;
    const cost = parseFloat(adjCost)||itemCost(item)||0;
    if (!qty) { setReceiveModal(null); return; }
    const lot = { id:"lot"+Date.now(), date:new Date().toISOString().split("T")[0], qty:Math.abs(qty), remaining:Math.max(0,qty), costPerUnit:cost, poId:"manual", note:adjNote||"" };
    setItems(p=>p.map(x=>x.id===item.id?{...x,lots:[...(x.lots||[]),lot],lastCost:cost}:x));
    setAdjustModal(null);
  }

  const filteredItems = items.filter(x => x.n.toLowerCase().includes(search.toLowerCase()) || x.cat.toLowerCase().includes(search.toLowerCase()));
  const lowStock = items.filter(x => itemStock(x) <= x.reorderAt && x.reorderAt > 0);

  return (
    <>
      <style>{CSS}</style>
      <div className="erp-wrap">
        <div style={{marginBottom:16}}>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>Inventory</div>
          <div style={{fontSize:12,color:"var(--text-3)"}}>Items, vendors, purchase orders, and stock management</div>
        </div>

        {lowStock.length > 0 && (
          <div style={{background:"rgba(200,74,74,0.08)",border:"1px solid rgba(200,74,74,0.3)",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>⚠️</span>
            <span style={{fontSize:12,color:"var(--danger)",fontWeight:500}}>{lowStock.length} item{lowStock.length>1?"s":""} at or below reorder point: {lowStock.map(x=>x.n).join(", ")}</span>
          </div>
        )}

        <div className="erp-tabs">
          {[["items","📦 Items"],["vendors","🏢 Vendors"],["pos","📋 Purchase Orders"],["ledger","📒 Stock Ledger"]].map(([v,l])=>(
            <button key={v} className={"erp-tab"+(tab===v?" active":"")} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>

        {/* ── ITEMS TAB ── */}
        {tab==="items" && (
          <div className="erp-card">
            <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center"}}>
              <input className="erp-inp" placeholder="Search items..." value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:260}} />
              <div style={{fontSize:10,color:"var(--text-3)",fontStyle:"italic"}}>QuickBooks / accounting software API bridge coming in v2</div>
              <button className="erp-btn erp-secondary" style={{fontSize:11,padding:"5px 10px"}} onClick={()=>setItems(DEFAULT_ITEMS)}>Reset defaults</button>
              <button className="erp-btn erp-secondary" style={{fontSize:11,padding:"5px 10px"}} onClick={downloadTemplate}>↓ Download CSV template</button>
              <label className="erp-btn erp-secondary" style={{fontSize:11,padding:"5px 10px",cursor:"pointer",margin:0}}>
                ↑ Upload CSV
                <input type="file" accept=".csv" style={{display:"none"}} onChange={handleCSVFile} />
              </label>
              {!itemForm && <button className="erp-btn erp-primary" style={{marginLeft:"auto"}} onClick={()=>{setItemForm({...EMPTY_ITEM});setErr("");}}>+ Add item</button>}
            </div>

            {itemForm && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="erp-lbl">Item name</label><input className="erp-inp" value={itemForm.n} onChange={e=>setIF("n",e.target.value)} placeholder="n-Butane (Extraction Grade)" /></div>
                  <div><label className="erp-lbl">Category</label><select className="erp-sel" value={itemForm.cat} onChange={e=>setIF("cat",e.target.value)}>{ITEM_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                  <div><label className="erp-lbl">Unit of measure</label><select className="erp-sel" value={itemForm.uom} onChange={e=>setIF("uom",e.target.value)}>{UOMS.map(u=><option key={u}>{u}</option>)}</select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="erp-lbl">Reorder at (units)</label><input type="number" className="erp-inp" value={itemForm.reorderAt} onChange={e=>setIF("reorderAt",e.target.value)} /></div>
                  <div><label className="erp-lbl">Reorder qty (units)</label><input type="number" className="erp-inp" value={itemForm.reorderQty} onChange={e=>setIF("reorderQty",e.target.value)} /></div>
                  <div><label className="erp-lbl">Valuation method</label><select className="erp-sel" value={itemForm.vm} onChange={e=>setIF("vm",e.target.value)}>{VAL_METHODS.map(m=><option key={m.v} value={m.v}>{m.l}</option>)}</select></div>
                </div>
                <div style={{marginBottom:10}}><label className="erp-lbl">Notes</label><input className="erp-inp" value={itemForm.notes||""} onChange={e=>setIF("notes",e.target.value)} /></div>
                {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="erp-btn erp-primary" onClick={saveItem}>{itemForm.id?"Save changes":"Add item"}</button>
                  <button className="erp-btn erp-secondary" onClick={()=>{setItemForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{overflowX:"auto",border:"1px solid var(--border)",borderRadius:8}}>
              <table className="erp-tbl">
                <thead><tr><th>Item</th><th>Category</th><th>UoM</th><th>In Stock</th><th>Reorder At</th><th>Unit Cost</th><th>Stock Value</th><th>Valuation</th><th></th></tr></thead>
                <tbody>
                  {ITEM_CATS.map(cat => {
                    const catItems = filteredItems.filter(x=>x.cat===cat);
                    if (!catItems.length) return null;
                    return [
                      <tr key={"h-"+cat}><td colSpan={9} style={{background:"var(--surface-2)",fontSize:10,fontWeight:700,color:"var(--text-3)",letterSpacing:"0.08em",textTransform:"uppercase",padding:"5px 10px"}}>{cat}</td></tr>,
                      ...catItems.map(item => {
                        const stock = itemStock(item);
                        const cost = itemCost(item);
                        const isLow = stock <= item.reorderAt && item.reorderAt > 0;
                        const isWarn = stock <= item.reorderAt * 1.3 && !isLow;
                        return (
                          <tr key={item.id}>
                            <td style={{fontWeight:500,color:"var(--text)"}}>{item.n}</td>
                            <td>{item.cat}</td>
                            <td>{item.uom}</td>
                            <td className={isLow?"stock-low":isWarn?"stock-warn":"stock-ok"}>{fmtN(stock)} {item.uom}{isLow?" ⚠️":""}</td>
                            <td style={{color:"var(--text-3)"}}>{fmtN(item.reorderAt)}</td>
                            <td>{cost>0?fmtC(cost):"—"}</td>
                            <td style={{color:"var(--accent-2)",fontWeight:500}}>{cost>0?fmtC(stock*cost):"—"}</td>
                            <td style={{fontSize:10,color:"var(--text-3)"}}>{VAL_METHODS.find(m=>m.v===item.vm)?.l||item.vm}</td>
                            <td>
                              <div style={{display:"flex",gap:6,flexWrap:"nowrap"}}>
                                <button className="erp-btn erp-secondary" style={{padding:"3px 7px",fontSize:10}} onClick={()=>{setAdjustModal({item,adjQty:"",adjCost:String(cost||""),adjNote:""});}}>Adjust</button>
                                <button className="erp-btn erp-secondary" style={{padding:"3px 7px",fontSize:10}} onClick={()=>{setItemForm({...item,reorderAt:String(item.reorderAt),reorderQty:String(item.reorderQty)});setErr("");}}>Edit</button>
                                <button className="erp-danger" onClick={()=>removeItem(item.id)}>✕</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ];
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginTop:14}}>
              {[
                {l:"Total SKUs",v:String(items.length)},
                {l:"Total stock value",v:fmtC(items.reduce((a,x)=>a+itemStock(x)*itemCost(x),0))},
                {l:"Items to reorder",v:String(lowStock.length)+(lowStock.length?" ⚠️":"")},
              ].map((s,i)=>(
                <div key={i} style={{background:"var(--surface-2)",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:10,color:"var(--text-3)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{s.l}</div>
                  <div style={{fontSize:18,fontWeight:700,color:i===2&&lowStock.length?"var(--danger)":"var(--accent-2)"}}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── VENDORS TAB ── */}
        {tab==="vendors" && (
          <div className="erp-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
              {!vendorForm && <button className="erp-btn erp-primary" onClick={()=>{setVendorForm({...EMPTY_VENDOR});setErr("");}}>+ Add vendor</button>}
            </div>
            {vendorForm && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="erp-lbl">Company name</label><input className="erp-inp" value={vendorForm.n} onChange={e=>setVF("n",e.target.value)} placeholder="Precision Packaging Co." /></div>
                  <div><label className="erp-lbl">Contact name</label><input className="erp-inp" value={vendorForm.contact||""} onChange={e=>setVF("contact",e.target.value)} /></div>
                  <div><label className="erp-lbl">Phone</label><input className="erp-inp" value={vendorForm.phone||""} onChange={e=>setVF("phone",e.target.value)} /></div>
                  <div><label className="erp-lbl">Email</label><input className="erp-inp" value={vendorForm.email||""} onChange={e=>setVF("email",e.target.value)} /></div>
                  <div><label className="erp-lbl">Lead time (days)</label><input type="number" className="erp-inp" value={vendorForm.leadDays||""} onChange={e=>setVF("leadDays",e.target.value)} /></div>
                  <div><label className="erp-lbl">Notes</label><input className="erp-inp" value={vendorForm.notes||""} onChange={e=>setVF("notes",e.target.value)} /></div>
                </div>
                {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8}}>
                  <button className="erp-btn erp-primary" onClick={saveVendor}>{vendorForm.id?"Save":"Add vendor"}</button>
                  <button className="erp-btn erp-secondary" onClick={()=>{setVendorForm(null);setErr("");}}>Cancel</button>
                </div>
              </div>
            )}
            {vendors.length===0 ? (
              <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)",fontSize:13}}>No vendors yet. Add your first supplier.</div>
            ) : (
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="erp-tbl">
                  <thead><tr><th>Vendor</th><th>Contact</th><th>Phone</th><th>Email</th><th>Lead Time</th><th></th></tr></thead>
                  <tbody>
                    {vendors.map(v=>(
                      <tr key={v.id}>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{v.n}</td>
                        <td>{v.contact||"—"}</td><td>{v.phone||"—"}</td><td>{v.email||"—"}</td>
                        <td>{v.leadDays||"—"} days</td>
                        <td><div style={{display:"flex",gap:6}}>
                          <button className="erp-btn erp-secondary" style={{padding:"3px 7px",fontSize:10}} onClick={()=>{setVendorForm(v);setErr("");}}>Edit</button>
                          <button className="erp-danger" onClick={()=>setVendors(p=>p.filter(x=>x.id!==v.id))}>✕</button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── PURCHASE ORDERS TAB ── */}
        {tab==="pos" && (
          <div className="erp-card">
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
              {!poForm && <button className="erp-btn erp-primary" onClick={openNewPO} disabled={!vendors.length}>+ New PO {!vendors.length&&"(add vendor first)"}</button>}
            </div>

            {poForm && (
              <div style={{background:"var(--surface-2)",border:"1px solid var(--border-2)",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label className="erp-lbl">PO Number</label><input className="erp-inp" value={poForm.poNum} onChange={e=>setPoForm(f=>({...f,poNum:e.target.value}))} /></div>
                  <div><label className="erp-lbl">Vendor</label><select className="erp-sel" value={poForm.vendorId} onChange={e=>setPoForm(f=>({...f,vendorId:e.target.value}))}><option value="">— Select vendor —</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.n}</option>)}</select></div>
                  <div><label className="erp-lbl">PO Date</label><input type="date" className="erp-inp" value={poForm.date} onChange={e=>setPoForm(f=>({...f,date:e.target.value}))} /></div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-2)",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Line Items</div>
                  {poForm.items.map((line,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:6,alignItems:"flex-end"}}>
                      <div><label className="erp-lbl">Item</label><select className="erp-sel" value={line.itemId} onChange={e=>setPOLine(i,"itemId",e.target.value)}><option value="">— Select item —</option>{items.map(x=><option key={x.id} value={x.id}>{x.n}</option>)}</select></div>
                      <div><label className="erp-lbl">Qty ({items.find(x=>x.id===line.itemId)?.uom||"units"})</label><input type="number" className="erp-inp" value={line.qty} onChange={e=>setPOLine(i,"qty",e.target.value)} /></div>
                      <div><label className="erp-lbl">Unit cost ($)</label><input type="number" className="erp-inp" step="0.01" value={line.unitCost} onChange={e=>setPOLine(i,"unitCost",e.target.value)} /></div>
                      <button className="erp-danger" style={{marginBottom:0}} onClick={()=>setPoForm(f=>({...f,items:f.items.filter((_,idx)=>idx!==i)}))}>✕</button>
                    </div>
                  ))}
                  <button className="erp-btn erp-secondary" style={{fontSize:11,padding:"4px 10px",marginTop:4}} onClick={addPOLine}>+ Add line</button>
                </div>
                <div style={{marginBottom:10}}><label className="erp-lbl">Notes</label><input className="erp-inp" value={poForm.notes} onChange={e=>setPoForm(f=>({...f,notes:e.target.value}))} /></div>
                {err && <div style={{fontSize:12,color:"var(--danger)",marginBottom:8}}>{err}</div>}
                <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--accent-2)"}}>Total: {fmtC(poForm.items.reduce((a,l)=>(a+(parseFloat(l.qty)||0)*(parseFloat(l.unitCost)||0)),0))}</div>
                  <div style={{display:"flex",gap:8}}>
                    <button className="erp-btn erp-primary" onClick={savePO}>Save PO</button>
                    <button className="erp-btn erp-secondary" onClick={()=>{setPoForm(null);setErr("");}}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {pos.length===0 ? (
              <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)",fontSize:13}}>No purchase orders yet.</div>
            ) : (
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="erp-tbl">
                  <thead><tr><th>PO #</th><th>Vendor</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {[...pos].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(po=>{
                      const vendor = vendors.find(v=>v.id===po.vendorId);
                      const total = po.items.reduce((a,l)=>a+l.qty*l.unitCost,0);
                      return (
                        <tr key={po.id}>
                          <td style={{fontWeight:500,color:"var(--text)",fontFamily:"monospace"}}>{po.poNum}</td>
                          <td>{vendor?.n||"—"}</td>
                          <td>{po.date}</td>
                          <td>{po.items.length} line{po.items.length!==1?"s":""}</td>
                          <td style={{color:"var(--accent-2)",fontWeight:500}}>{fmtC(total)}</td>
                          <td><span className={"po-status po-"+po.status}>{po.status}</span></td>
                          <td>
                            {po.status!=="received" && (
                              <button className="erp-btn erp-secondary" style={{padding:"3px 8px",fontSize:10}} onClick={()=>openReceive(po)}>Receive</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── LEDGER TAB ── */}
        {tab==="ledger" && (
          <div className="erp-card">
            <div style={{fontSize:12,color:"var(--text-2)",marginBottom:14}}>All inventory receipts and adjustments</div>
            {items.every(x=>!(x.lots?.length)) ? (
              <div style={{textAlign:"center",padding:"32px",color:"var(--text-3)",fontSize:13}}>No stock movements yet. Receive a purchase order to begin.</div>
            ) : (
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
                <table className="erp-tbl">
                  <thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Qty</th><th>UoM</th><th>Unit Cost</th><th>Total Value</th><th>Source</th><th>Remaining</th></tr></thead>
                  <tbody>
                    {items.flatMap(item=>(item.lots||[]).map(lot=>({item,lot}))).sort((a,b)=>new Date(b.lot.date)-new Date(a.lot.date)).map(({item,lot},i)=>(
                      <tr key={i}>
                        <td style={{whiteSpace:"nowrap"}}>{lot.date}</td>
                        <td style={{fontWeight:500,color:"var(--text)"}}>{item.n}</td>
                        <td style={{fontSize:11,color:"var(--text-3)"}}>{item.cat}</td>
                        <td>{fmtN(lot.qty)}</td>
                        <td>{item.uom}</td>
                        <td>{fmtC(lot.costPerUnit)}</td>
                        <td style={{color:"var(--accent-2)"}}>{fmtC(lot.qty*lot.costPerUnit)}</td>
                        <td style={{fontSize:11,color:"var(--text-3)",fontFamily:"monospace"}}>{lot.poId==="manual"?"Manual adj":lot.poId}</td>
                        <td className={lot.remaining<lot.qty*0.2?"stock-warn":"stock-ok"}>{fmtN(lot.remaining)} {item.uom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Receive modal */}
        {receiveModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:12,padding:24,width:480,maxHeight:"80vh",overflowY:"auto"}}>
              <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:14}}>Receive PO — {receiveModal.po.poNum}</div>
              {receiveModal.lines.map((line,i)=>{
                const item=items.find(x=>x.id===line.itemId);
                return (
                  <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginBottom:8,alignItems:"flex-end"}}>
                    <div style={{fontSize:12,color:"var(--text-2)"}}>{item?.n||line.itemId}</div>
                    <div><label className="erp-lbl">Ordered</label><div style={{fontSize:13,color:"var(--text-3)"}}>{line.qty} {item?.uom}</div></div>
                    <div><label className="erp-lbl">Receive now</label>
                      <input type="number" className="erp-inp" value={line.receiveNow}
                        onChange={e=>setReceiveModal(m=>({...m,lines:m.lines.map((l,idx)=>idx===i?{...l,receiveNow:e.target.value}:l)}))} />
                    </div>
                  </div>
                );
              })}
              <div style={{display:"flex",gap:8,marginTop:14}}>
                <button className="erp-btn erp-primary" onClick={confirmReceive}>Confirm Receipt</button>
                <button className="erp-btn erp-secondary" onClick={()=>setReceiveModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* CSV import preview modal */}
        {csvPreview && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:12,padding:24,width:640,maxHeight:"80vh",overflowY:"auto"}}>
              <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:4}}>Import Preview — {csvFileName}</div>
              {csvPreview.errors.length>0 && (
                <div style={{fontSize:12,color:"var(--danger)",marginBottom:10}}>
                  {csvPreview.errors.map((e,i)=><div key={i}>⚠ {e}</div>)}
                </div>
              )}
              {csvPreview.rows.length>0 && (
                <>
                  <div style={{fontSize:12,color:"var(--text-3)",marginBottom:10}}>{csvPreview.rows.length} item{csvPreview.rows.length!==1?"s":""} ready to import as new inventory items with opening stock lots.</div>
                  <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginBottom:14}}>
                    <table className="erp-tbl">
                      <thead><tr><th>Item</th><th>Category</th><th>UoM</th><th>Stock</th><th>Cost</th><th>Reorder At</th></tr></thead>
                      <tbody>
                        {csvPreview.rows.slice(0,50).map((r,i)=>(
                          <tr key={i}><td>{r.n}</td><td>{r.cat}</td><td>{r.uom}</td><td>{fmtN(r.stock)}</td><td>{fmtC(r.cost)}</td><td>{fmtN(r.reorderAt)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvPreview.rows.length>50 && <div style={{fontSize:11,color:"var(--text-3)",marginBottom:10}}>Showing first 50 of {csvPreview.rows.length} rows.</div>}
                </>
              )}
              <div style={{display:"flex",gap:8}}>
                {csvPreview.rows.length>0 && <button className="erp-btn erp-primary" onClick={confirmCSVImport}>Import {csvPreview.rows.length} items</button>}
                <button className="erp-btn erp-secondary" onClick={()=>{setCsvPreview(null);setCsvFileName("");}}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Adjust modal */}
        {adjustModal && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"var(--surface)",border:"1px solid var(--border-2)",borderRadius:12,padding:24,width:380}}>
              <div style={{fontSize:14,fontWeight:600,color:"var(--text)",marginBottom:4}}>Stock Adjustment</div>
              <div style={{fontSize:12,color:"var(--text-3)",marginBottom:14}}>{adjustModal.item.n}</div>
              <div style={{display:"grid",gap:10,marginBottom:14}}>
                <div><label className="erp-lbl">Quantity to add (use negative to reduce)</label><input type="number" className="erp-inp" value={adjustModal.adjQty} onChange={e=>setAdjustModal(m=>({...m,adjQty:e.target.value}))} /></div>
                <div><label className="erp-lbl">Cost per unit ($)</label><input type="number" className="erp-inp" step="0.01" value={adjustModal.adjCost} onChange={e=>setAdjustModal(m=>({...m,adjCost:e.target.value}))} /></div>
                <div><label className="erp-lbl">Reason / note</label><input className="erp-inp" value={adjustModal.adjNote||""} onChange={e=>setAdjustModal(m=>({...m,adjNote:e.target.value}))} /></div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="erp-btn erp-primary" onClick={confirmAdjust}>Apply Adjustment</button>
                <button className="erp-btn erp-secondary" onClick={()=>setAdjustModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
