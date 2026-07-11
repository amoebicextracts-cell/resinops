/**
 * StrainCombo.jsx
 * Shared strain selector / creator used across all ResinOps modules.
 *
 * Props:
 *   value        {string}   current strain name string
 *   onChange     {fn}       called with (strainName, strainObj|null) when selection changes
 *   onSelect     {fn}       optional — called with full strain object when an existing strain is picked
 *   placeholder  {string}
 *   className    {string}   CSS class to apply to the input (e.g. "hb-inp")
 *   style        {object}
 *   autoFocus    {bool}
 */

import { useState, useEffect, useRef } from "react";
import { db } from "./lib/db";

const COMBO_CSS = `
  .sc-wrap{position:relative;width:100%;}
  .sc-dropdown{position:absolute;top:100%;left:0;right:0;z-index:999;background:var(--surface);border:1px solid var(--accent);border-top:none;border-radius:0 0 8px 8px;max-height:220px;overflow-y:auto;box-shadow:0 6px 20px rgba(0,0,0,0.25);}
  .sc-item{padding:8px 12px;font-size:12px;cursor:pointer;color:var(--text-2);display:flex;justify-content:space-between;align-items:center;gap:8px;}
  .sc-item:hover,.sc-item.sc-active{background:var(--surface-2);color:var(--text);}
  .sc-item-meta{font-size:10px;color:var(--text-3);white-space:nowrap;}
  .sc-new{padding:8px 12px;font-size:12px;cursor:pointer;color:var(--accent-2);border-top:1px solid var(--border);display:flex;align-items:center;gap:6px;}
  .sc-new:hover{background:var(--surface-2);}
  .sc-badge{font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(74,124,89,0.15);color:var(--accent-2);}
`;

let _styleInjected = false;
function injectStyle(){
  if(_styleInjected) return;
  const el = document.createElement("style");
  el.textContent = COMBO_CSS;
  document.head.appendChild(el);
  _styleInjected = true;
}

export default function StrainCombo({ value="", onChange, onSelect, placeholder="Strain name", className="", style={}, autoFocus=false }){
  injectStyle();

  const [strains, setStrains] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Load strains from db layer on mount and whenever dropdown opens
  useEffect(()=>{
    db.strains.list().then(data => setStrains(data)).catch(()=>{});
  }, [open]);

  // Close on outside click
  useEffect(()=>{
    function handler(e){ if(wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return ()=>document.removeEventListener("mousedown", handler);
  }, []);

  const q = (value||"").toLowerCase().trim();
  const filtered = q.length === 0
    ? strains.slice(0, 20)
    : strains.filter(s => s.name.toLowerCase().includes(q)).slice(0, 20);

  const showNew = q.length > 1 && !strains.some(s => s.name.toLowerCase() === q);

  function pick(strain){
    onChange(strain.name, strain);
    if(onSelect) onSelect(strain);
    setOpen(false);
    setHighlighted(-1);
  }

  function handleKey(e){
    if(!open){ if(e.key==="ArrowDown"||e.key==="Enter"){ setOpen(true); return; } }
    const total = filtered.length + (showNew ? 1 : 0);
    if(e.key==="ArrowDown"){ e.preventDefault(); setHighlighted(h=>Math.min(h+1, total-1)); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); setHighlighted(h=>Math.max(h-1, -1)); }
    else if(e.key==="Enter"){
      e.preventDefault();
      if(highlighted >= 0 && highlighted < filtered.length) pick(filtered[highlighted]);
      else if(highlighted === filtered.length && showNew){ setOpen(false); onChange(value, null); }
      else setOpen(false);
    }
    else if(e.key==="Escape"){ setOpen(false); setHighlighted(-1); }
  }

  function strainMeta(s){
    const parts = [];
    if(s.thcaAvg) parts.push("THCa "+s.thcaAvg+"%");
    if(s.type) parts.push(s.type);
    return parts.join(" · ");
  }

  return(
    <div className="sc-wrap" ref={wrapRef}>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        className={className}
        style={{width:"100%", boxSizing:"border-box", ...style}}
        placeholder={placeholder}
        value={value}
        onChange={e=>{ onChange(e.target.value, null); setOpen(true); setHighlighted(-1); }}
        onFocus={()=>setOpen(true)}
        onKeyDown={handleKey}
        autoComplete="off"
      />
      {open && (filtered.length > 0 || showNew) && (
        <div className="sc-dropdown">
          {filtered.map((s,i)=>(
            <div key={s.id} className={"sc-item"+(highlighted===i?" sc-active":"")}
              onMouseEnter={()=>setHighlighted(i)}
              onMouseDown={e=>{e.preventDefault(); pick(s);}}>
              <span>{s.name} {s.breeder&&<span style={{fontSize:10,color:"var(--text-3)"}}>· {s.breeder}</span>}</span>
              <span className="sc-item-meta">{strainMeta(s)}</span>
            </div>
          ))}
          {showNew && (
            <div className="sc-new"
              onMouseDown={e=>{e.preventDefault(); setOpen(false); onChange(value, null);}}>
              <span className="sc-badge">NEW</span>
              Add <strong style={{color:"var(--text)"}}>{value}</strong> as new strain
            </div>
          )}
        </div>
      )}
    </div>
  );
}
