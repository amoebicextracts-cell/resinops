import { useState, useRef, useEffect } from "react";

const CSS = `
  .oa-wrap{display:flex;flex-direction:column;height:100%;padding:0;}
  .oa-header{padding:20px 24px 0;flex-shrink:0;}
  .oa-messages{flex:1;overflow-y:auto;padding:16px 24px;display:flex;flex-direction:column;gap:12px;}
  .oa-msg{display:flex;gap:12px;align-items:flex-start;}
  .oa-msg.user{flex-direction:row-reverse;}
  .oa-avatar{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
  .oa-avatar.ai{background:linear-gradient(135deg,#2d5a3d,#4a7c59);color:#fff;}
  .oa-avatar.user{background:var(--surface-2);color:var(--text-2);}
  .oa-bubble{background:var(--surface-2);border-radius:12px;padding:10px 14px;font-size:13px;color:var(--text);line-height:1.6;max-width:85%;border:1px solid var(--border-2);}
  .oa-bubble.user{background:rgba(74,124,89,0.12);border-color:rgba(74,124,89,0.25);}
  .oa-bubble.ai{background:var(--surface);}
  .oa-bubble strong{color:var(--accent-2);}
  .oa-bubble ul{margin:6px 0 4px 16px;padding:0;}
  .oa-bubble li{margin-bottom:4px;}
  .oa-input-row{padding:12px 24px 20px;flex-shrink:0;border-top:1px solid var(--border);}
  .oa-inp{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:10px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;padding:10px 14px;resize:none;outline:none;box-sizing:border-box;}
  .oa-inp:focus{border-color:var(--accent);}
  .oa-send{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:9px 18px;cursor:pointer;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;flex-shrink:0;}
  .oa-send:disabled{opacity:0.5;cursor:not-allowed;}
  .oa-chip{background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;padding:6px 12px;font-size:11px;color:var(--text-2);cursor:pointer;transition:all 0.15s;white-space:nowrap;}
  .oa-chip:hover{border-color:var(--accent);color:var(--accent-2);background:rgba(74,124,89,0.06);}
  .oa-thinking{display:flex;gap:4px;align-items:center;padding:4px 0;}
  .oa-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:oa-bounce 1.2s ease-in-out infinite;}
  .oa-dot:nth-child(2){animation-delay:0.2s;}
  .oa-dot:nth-child(3){animation-delay:0.4s;}
  @keyframes oa-bounce{0%,80%,100%{transform:scale(0.7);opacity:0.5}40%{transform:scale(1);opacity:1}}
`;

const SUGGESTIONS = [
  "Which strain is most profitable per pound?",
  "Am I on track for my Q3 harvest targets?",
  "What's my total pending revenue pipeline?",
  "Which employees have pesticide licenses expiring soon?",
  "What were my top selling strains this quarter?",
  "Summarize my current production status",
  "Which batches are still on QC hold?",
  "What's my average THCa% across all strains?",
  "How many pounds have I harvested this year?",
  "What cultivation inputs did I apply last month?",
];

function gatherFacilityData() {
  const get = (key) => { try { return JSON.parse(localStorage.getItem(key)||"[]"); } catch { return []; } };
  const getObj = (key) => { try { return JSON.parse(localStorage.getItem(key)||"{}"); } catch { return {}; } };
  return {
    facility: getObj("resinops_facility_settings"),
    employees: get("resinops_employees"),
    harvestBatches: get("resinops_harvest_batches"),
    prodBatches: get("resinops_prod"),
    qcTests: get("resinops_qc_tests"),
    qcHolds: get("resinops_qc_holds"),
    salesOrders: get("resinops_orders"),
    cultInputs: get("resinops_cult_inputs"),
    sprayLog: get("resinops_spray_log"),
    strains: get("resinops_strains"),
    skus: get("resinops_skus"),
    boms: get("resinops_boms"),
    spaces: get("resinops_spaces"),
    growMap: get("resinops_grow_map"),
    equipment: get("resinops_equipment"),
    laborTypes: get("resinops_labor_types"),
    inventory: get("resinops_inventory"),
    facilityMap: get("resinops_facility_map"),
    tcVessels: get("resinops_tc_vessels"),
    cloneSchedules: get("resinops_clone_sched"),
    mothers: get("resinops_mothers"),
    deviations: get("resinops_deviations"),
    shifts: get("resinops_shifts"),
    sops: get("resinops_sops"),
  };
}

function buildSystemPrompt(data) {
  const f = data.facility;
  // Summarize key data points to keep context lean
  const hbSummary = data.harvestBatches.map(b => ({
    id: b.id, strain: b.strainName, date: b.d,
    dryLbs: b.totalDryWeight ? (parseFloat(b.totalDryWeight)/453.592).toFixed(1) : null,
    status: b.status, thca: b.thca,
    coaSampleId: b.coaSampleId,
  }));
  const salesSummary = data.salesOrders.map(o => ({
    account: o.customerName||o.dispensaryName,
    status: o.importStatus||o.status,
    total: o.lines?.reduce((a,l)=>a+(parseFloat(l.orderTotal)||parseFloat(l.qty||0)*parseFloat(l.unitPrice||0)),0)||parseFloat(o.orderTotal||0),
    product: o.lines?.[0]?.product||o.product,
    date: o.orderDate,
  }));
  const qcSummary = data.qcTests.map(t => ({
    strain: t.strainName, sampleId: t.sampleId, thca: t.thca,
    totalThc: t.totalThc, totalTerpenes: t.totalTerpenes,
    overallPass: t.overallPass, lab: t.labName,
  }));
  const empSummary = data.employees.map(e => ({
    name: e.name, title: e.title,
    pestLicense: e.pestLicenseCategory,
    expiry: e.pestLicenseExpiry,
  }));
  const prodSummary = data.prodBatches.filter(b=>!b.isLinked).map(b => ({
    name: b.name, cat: b.catLabel, status: b.status,
    strain: b.strains, date: b.d, yield: b.actual_yield||b.yieldEst,
  }));

  return `You are the ResinOps AI Operations Analyst for ${f.facilityName||"this cannabis facility"} — a licensed cannabis operation${f.licenseNumber?` (License: ${f.licenseNumber})`:""}${f.state?` in ${f.state}`:""}. You have direct access to all facility data and answer questions like a seasoned cannabis operations director would — concise, data-driven, actionable.

FACILITY DATA SUMMARY:
======================
Facility: ${f.facilityName||"Not configured"} | License: ${f.licenseNumber||"N/A"} | State: ${f.state||"N/A"}

HARVEST BATCHES (${data.harvestBatches.length} total):
${JSON.stringify(hbSummary, null, 1)}

PRODUCTION BATCHES (${data.prodBatches.filter(b=>!b.isLinked).length} active):
${JSON.stringify(prodSummary, null, 1)}

QC / COA RESULTS (${data.qcTests.length} total):
${JSON.stringify(qcSummary, null, 1)}

QC HOLDS: ${data.qcHolds.length} batches currently on hold

SALES ORDERS (${data.salesOrders.length} total):
${JSON.stringify(salesSummary, null, 1)}

EMPLOYEES (${data.employees.length} total):
${JSON.stringify(empSummary, null, 1)}

STRAINS IN DATABASE: ${data.strains.map(s=>s.name).join(", ")||"None"}

GROW SPACES ACTIVE: ${data.spaces.length} scheduled batches

SKUs CONFIGURED: ${data.skus.length} | BOMs CONFIGURED: ${data.boms.length}

CULTIVATION INPUTS: ${data.cultInputs.length} records | SPRAY LOG: ${data.sprayLog.length} records

TC VESSELS: ${data.tcVessels.length} | CLONE SCHEDULES: ${data.cloneSchedules.length}

EQUIPMENT: ${data.equipment.length} assets | DEVIATIONS: ${data.deviations.filter(d=>d.status==="open").length} open

LABOR TYPES: ${data.laborTypes.map(l=>l.n+"("+l.count+"@$"+l.rate+"/hr)").join(", ")||"None configured"}

INSTRUCTIONS:
- Answer questions about this facility's data directly and specifically
- Use actual numbers from the data — don't say "approximately" when you have exact figures
- Format responses with markdown bold for key numbers and bullet points for lists
- If data is missing or sparse, say so honestly and suggest what to import
- For financial calculations: confirmed orders are revenue, pending is pipeline
- For compliance questions, reference NY OCM/DEC requirements specifically
- Keep answers concise — 3-8 sentences or a short list, not an essay
- If asked something outside the data, say what data would be needed`;
}

export default function OpsAnalyst() {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "Good morning. I'm your ResinOps Operations Analyst — I have access to all your facility data right now. Ask me anything about your harvests, revenue pipeline, compliance status, strain performance, or production schedule. What would you like to know?"
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);

  async function send(text) {
    const q = (text||input).trim();
    if(!q||loading) return;
    setInput("");
    const userMsg = { role:"user", content:q };
    setMessages(prev=>[...prev, userMsg]);
    setLoading(true);

    try {
      const data = gatherFacilityData();
      const systemPrompt = buildSystemPrompt(data);
      const history = [...messages, userMsg].map(m=>({role:m.role,content:m.content}));

      const res = await fetch("/api/import", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-6",
          max_tokens:1000,
          system: systemPrompt,
          messages: history,
        })
      });
      const json = await res.json();
      const reply = json.content?.[0]?.text || "I couldn't generate a response. Please try again.";
      setMessages(prev=>[...prev,{role:"assistant",content:reply}]);
    } catch(e) {
      setMessages(prev=>[...prev,{role:"assistant",content:"Error connecting to AI. Please check your connection and try again."}]);
    }
    setLoading(false);
  }

  function handleKey(e) {
    if(e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); send(); }
  }

  // Format markdown-lite in AI responses
  function formatMsg(text) {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      // Bold **text**
      const parts = line.split(/\*\*(.*?)\*\*/g);
      const formatted = parts.map((p,j) => j%2===1 ? <strong key={j}>{p}</strong> : p);
      if(line.startsWith("- ")||line.startsWith("• ")) {
        return <li key={i} style={{marginBottom:3}}>{formatted.map((p,j)=>j===0&&typeof p==="string"?p.replace(/^[-•]\s/,""):p)}</li>;
      }
      if(line.trim()==="") return <br key={i}/>;
      return <span key={i}>{formatted}<br/></span>;
    });
  }

  const hasData = gatherFacilityData().harvestBatches.length > 0 ||
    gatherFacilityData().salesOrders.length > 0 ||
    gatherFacilityData().prodBatches.length > 0;

  return (
    <>
      <style>{CSS}</style>
      <div className="oa-wrap">
        <div className="oa-header">
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:3}}>AI Operations Analyst</div>
          <div style={{fontSize:12,color:"var(--text-3)",marginBottom:12}}>Ask plain-English questions about your facility data — harvests, revenue, compliance, strain performance, and more</div>

          {!hasData&&(
            <div style={{background:"rgba(200,150,58,0.1)",border:"1px solid rgba(200,150,58,0.25)",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"var(--amber)"}}>
              ⚠ Limited data loaded — load demo facility settings or import your data for full analysis
            </div>
          )}

          {/* Suggestion chips */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4,paddingBottom:12,borderBottom:"1px solid var(--border)"}}>
            {SUGGESTIONS.slice(0,6).map((s,i)=>(
              <button key={i} className="oa-chip" onClick={()=>send(s)}>{s}</button>
            ))}
          </div>
        </div>

        <div className="oa-messages">
          {messages.map((m,i)=>(
            <div key={i} className={"oa-msg "+(m.role==="user"?"user":"ai")}>
              <div className={"oa-avatar "+(m.role==="user"?"user":"ai")}>
                {m.role==="user"?"👤":"🌿"}
              </div>
              <div className={"oa-bubble "+(m.role==="user"?"user":"ai")}>
                {m.role==="assistant" ? (
                  <>{formatMsg(m.content)}</>
                ) : m.content}
              </div>
            </div>
          ))}
          {loading&&(
            <div className="oa-msg ai">
              <div className="oa-avatar ai">🌿</div>
              <div className="oa-bubble ai">
                <div className="oa-thinking">
                  <div className="oa-dot"/>
                  <div className="oa-dot"/>
                  <div className="oa-dot"/>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        <div className="oa-input-row">
          <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
            <textarea
              ref={textareaRef}
              className="oa-inp"
              rows={2}
              placeholder="Ask about your facility data... (Enter to send)"
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={handleKey}
              style={{flex:1}}
            />
            <button className="oa-send" onClick={()=>send()} disabled={loading||!input.trim()}>
              {loading?"...":"Send"}
            </button>
          </div>
          <div style={{fontSize:10,color:"var(--text-3)",marginTop:5,textAlign:"center"}}>
            Reads live from your ResinOps data — answers update as you import new records
          </div>
        </div>
      </div>
    </>
  );
}
