import { useState, useRef, useEffect } from "react";
import { db } from "./lib/db";

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

async function gatherFacilityData() {
  const [employees, harvestBatches, prodBatches, qcTests, salesOrders,
         cultInputs, sprayLog, strains, skus, boms, spaces, growMap,
         equipment, laborTypes, inventory, facilityMap, tcVessels,
         cloneSchedules, mothers, deviations, shifts, sops] = await Promise.all([
    db.employees.list(), db.harvest_batches.list(), db.production_batches.list(),
    db.qc_tests.list(), db.sales_orders.list(), db.cultivation_inputs.list(),
    db.spray_log.list(), db.strains.list(), db.skus.list(), db.boms.list(),
    db.grow_spaces.list(), db.grow_rooms.list(), db.equipment.list(),
    db.labor_types.list(), db.inventory_items.list(), db.facility_map_spaces.list(),
    db.tc_vessels.list(), db.clone_schedules.list(), db.mother_plants.list(),
    db.gmp_deviations.list(), db.gmp_shifts.list(), db.gmp_sops.list(),
  ]);
  return {
    facility: {}, employees, harvestBatches, prodBatches, qcTests,
    qcHolds: qcTests.filter(t=>t.overallPass===false||t.on_hold).map(t=>String(t.id)),
    salesOrders, cultInputs, sprayLog, strains, skus, boms, spaces, growMap,
    equipment, laborTypes, inventory, facilityMap, tcVessels,
    cloneSchedules, mothers, deviations, shifts, sops,
  };
}

function buildSystemPrompt(data) {
  const f = data.facility;
  const totalDryLbs = data.harvestBatches.filter(b=>b.status==="done"&&b.totalDryWeight>0).reduce((a,b)=>a+(parseFloat(b.totalDryWeight)||0)/453.592,0);
  const confirmedRev = data.salesOrders.filter(o=>(o.importStatus||"")===("confirmed")).reduce((a,o)=>a+(o.lines||[]).reduce((s,l)=>s+(parseFloat(l.orderTotal)||0),0),0);
  const pendingRev = data.salesOrders.filter(o=>(o.importStatus||"")==="pending").reduce((a,o)=>a+(o.lines||[]).reduce((s,l)=>s+(parseFloat(l.orderTotal)||0),0),0);
  const openDevs = data.deviations.filter(d=>d.status==="open").length;
  const onHold = data.qcHolds.length;
  const expLicenses = data.employees.filter(e=>{
    if(!e.pestLicenseExpiry) return false;
    return Math.ceil((new Date(e.pestLicenseExpiry)-new Date())/86400000) < 60;
  });

  return `You are the ResinOps AI Operations Analyst for ${f.facilityName||"this cannabis facility"} (${f.licenseNumber||"no license"}${f.state?", "+f.state:""}).
Answer questions like a seasoned cannabis operations director — concise, data-driven, actionable.

LIVE FACILITY DATA:
Harvest batches: ${data.harvestBatches.length} (${data.harvestBatches.filter(b=>b.status==="done").length} done, ${totalDryLbs.toFixed(1)} lbs total dry)
Production batches: ${data.prodBatches.filter(b=>!b.isLinked).length} active
QC tests: ${data.qcTests.length} COAs on file${onHold>0?`, ${onHold} on hold`:""}
Sales: ${data.salesOrders.length} orders — $${confirmedRev.toLocaleString()} confirmed, $${pendingRev.toLocaleString()} pending
Employees: ${data.employees.length}${expLicenses.length>0?` — ⚠ ${expLicenses.length} pesticide license(s) expiring soon`:""}
Open deviations: ${openDevs}
Active grow rooms: ${data.spaces.length}
Strains: ${data.strains.map(s=>s.name).join(", ")||"none"}

HARVEST DETAILS:
${data.harvestBatches.slice(0,8).map(b=>`${b.strainName}: ${b.totalDryWeight?((parseFloat(b.totalDryWeight)/453.592).toFixed(1)+"lbs"):"in progress"} | THCa: ${b.thca||"pending"}% | ${b.status}`).join("\n")}

COA RESULTS:
${data.qcTests.slice(0,8).map(t=>`${t.strainName}: THCa ${t.thca}% | Total THC ${t.totalThc}% | Terps ${t.totalTerpenes}% | ${t.overallPass?"PASS":"FAIL"}`).join("\n")}

PRODUCTION BATCHES:
${data.prodBatches.filter(b=>!b.isLinked).slice(0,8).map(b=>`${b.name}: ${b.status} | ${b.yieldEst||""}`).join("\n")}

SALES ORDERS:
${data.salesOrders.slice(0,8).map(o=>`${o.customerName}: ${o.importStatus} | $${(o.lines||[]).reduce((a,l)=>a+(parseFloat(l.orderTotal)||0),0).toLocaleString()}`).join("\n")}

RULES: Use actual numbers. Bold key figures with **. Use bullet points for lists. Keep answers under 200 words unless asked for detail. If data is missing say so and suggest what to import.`;
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
      const data = await gatherFacilityData();
      const systemPrompt = buildSystemPrompt(data);
      const history = [...messages, userMsg].map(m=>({role:m.role,content:m.content}));

      const res = await fetch("/api/import", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          system: systemPrompt,
          prompt: q,
          history: messages.slice(0,-1), // all prior messages except the one we just added
        })
      });
      const json = await res.json();
      if(json.error) throw new Error(json.error);
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

  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    gatherFacilityData().then(data => {
      setHasData(data.harvestBatches.length > 0 || data.salesOrders.length > 0 || data.prodBatches.length > 0);
    }).catch(() => {});
  }, []);

  return (
    <>
      <style>{CSS}</style>
      <div className="oa-wrap">
        <div className="oa-header">
          <!-- title removed - shown in app header -->

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
