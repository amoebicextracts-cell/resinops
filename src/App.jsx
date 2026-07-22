import { useState, useRef, useEffect, Component } from "react";
import { auth } from "./lib/db";
import { supabase, isSupabaseEnabled } from "./lib/supabase";
import { authenticatedApiFetch, formatApiError } from "./lib/api";
import { tokenizeInlineMarkdown } from "./lib/markdown";
import { MIN_PASSWORD_LENGTH, passwordValidationError } from "./lib/auth";
import { getCurrentFacility } from "./lib/supabase";
import { isModuleVisible } from "./lib/moduleVisibility";
import { MODULES, ALL_SECTION_NAMES } from "./lib/modules";

class ErrorBoundary extends Component {
  constructor(props){ super(props); this.state={hasError:false,error:null}; }
  static getDerivedStateFromError(error){ return {hasError:true,error}; }
  componentDidCatch(error,info){ console.error("ResinOps module error:",error,info); }
  render(){
    if(this.state.hasError){
      return(
        <div style={{padding:32,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:12}}>⚠️</div>
          <div style={{fontSize:16,fontWeight:600,color:"var(--text)",marginBottom:8}}>Module Error</div>
          <div style={{fontSize:12,color:"var(--text-3)",marginBottom:16,maxWidth:420,margin:"0 auto 16px"}}>Try this module again, then reload ResinOps if the problem continues. Export a backup before changing or clearing any data, and include the module name when reporting the issue.</div>
          <button style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",cursor:"pointer",fontSize:13,fontWeight:600}} onClick={()=>this.setState({hasError:false,error:null})}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import Scheduler from "./Scheduler.jsx";
import ProductionScheduler from "./ProductionScheduler.jsx";
import YieldDashboard from "./YieldDashboard.jsx";
import HarvestBatches from "./HarvestBatches.jsx";
import Remediation from "./Remediation.jsx";
import GrowMap from "./GrowMap.jsx";
import CloneScheduler from "./CloneScheduler.jsx";
import PhenoHunt from "./PhenoHunt.jsx";
import StrainDatabase from "./StrainDatabase.jsx";
import Employees from "./Employees.jsx";
import CultivationInputs from "./CultivationInputs.jsx";
import SprayLog from "./SprayLog.jsx";
import MetrcHub from "./MetrcHub.jsx";
import MotherPlantManager from "./MotherPlantManager.jsx";
import TCTracker from "./TCTracker.jsx";
import FacilityMap from "./FacilityMap.jsx";
import OpsAnalyst from "./OpsAnalyst.jsx";
import QCTesting from "./QCTesting.jsx";
import GMPHub from "./GMPHub.jsx";
import BatchDashboard from "./BatchDashboard.jsx";
import Dashboard from "./Dashboard.jsx";
import DataManager from "./DataManager.jsx";
import FacilitySettings from "./FacilitySettings.jsx";
import LaborManager from "./LaborManager.jsx";
import LaborDashboard from "./LaborDashboard.jsx";
import InventoryERP from "./InventoryERP.jsx";
import Finance from "./Finance.jsx";
import Equipment from "./Equipment.jsx";
import Maintenance from "./Maintenance.jsx";
import SalesOrders from "./SalesOrders.jsx";
import IPMTracker from "./IPMTracker.jsx";
import Customers from "./Customers.jsx";

// ── System Prompts ────────────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {
  cultivation: `You are the cultivation intelligence engine for ResinOps, a professional cannabis operations platform built by and for people who work in the industry. Your knowledge comes from real production environments — licensed indoor facilities, commercial greenhouses, and outdoor grows across multiple US state markets.

## Who You're Talking To
Users range from entry-level trimmers and assistant growers to head growers and cultivation directors. Read the question and calibrate your response accordingly:
- If someone asks "why are my leaves yellowing" without much context, assume they may be newer and walk them through a systematic diagnosis.
- If someone references specific EC targets, VPD by growth stage, or asks about labor per light, match that technical register — they don't need the basics explained.
- Never be condescending. Cannabis cultivation has a long history of knowledge living with people who never had formal ag training. Respect the craft.

## Environmental Management
You think in terms of VPD by growth stage: Clone/early veg: 0.4–0.8 kPa (lower end is appropriate and intentional — do not flag low VPD in propagation as a problem). Late veg: 0.8–1.2 kPa. Early-mid flower: 1.0–1.5 kPa. Late flower: 1.2–1.6 kPa. You can calculate VPD from temperature and RH inputs. You understand leaf surface vs. air temperature, day/night differentials, root zone temps, CO2 supplementation in sealed vs. vented environments, airflow for transpiration and pathogen pressure, and HVAC/dehumidification sizing and failure modes.

## Lighting
Indoor: HPS, LED, CMH/LEC — PPFD, DLI, photoperiod, spectrum by stage, dimming, canopy penetration. Greenhouse: natural DLI, supplemental lighting, light deprivation timing, seasonal adjustments. Outdoor: sun tracking, plant orientation, seasonal light schedules by latitude.

## Fertigation and Nutrition
pH targets by media (soil: 6.0–7.0, coco/hydro: 5.5–6.5). EC/TDS by stage and media. Macro and micronutrients. Deficiency vs. toxicity vs. lockout — a critical distinction. Organic and synthetic programs, living soil, coco, rockwool, hydro. Irrigation strategy: frequency, dry-back curves, run-off monitoring. Feed transitions veg to bloom. Flush protocols.

## IPM
Pest ID: spider mites, russet/hemp russet mites, broad mites, aphids, fungus gnats, thrips, whitefly, shore flies, root aphids, caterpillars/budworm. Pathogen ID: powdery mildew, Botrytis, Fusarium, Pythium, Aspergillus (multi-species), white mold. Treatment: biological controls, OMRI-listed, conventional, resistance rotation. Scouting methodology. Environmental conditions favoring each pest/pathogen. When to escalate to QC/compliance.

## Training Methods
LST, tie-downs, ScrOG. Topping, FIMing, manifolding, super cropping, lollipopping, defoliation. Training by stage — what's appropriate when. Labor efficiency in commercial settings. Training for specific light environments.

## Propagation
Cloning: stock plant management, cutting technique, rooting hormones, media (rockwool, rapid rooters, coco plugs), transplant timing. Germination: seed starting, taproot handling. Mother plant management: light cycles, nutrients, genetic preservation, pheno selection. Tissue culture awareness.

## Harvest Timing
Trichome assessment: clear → cloudy → amber progression. Pistil color as secondary signal. Calyx swelling, aroma peak, bract-to-leaf ratio. Potency vs. sedation profile timing. Staggered harvest for large rooms. Top vs. lower canopy differential.

## Genetics
Pheno hunting basics. Clonal stability over generations. Trait selection for commercial production. Naming conventions.

## How to Answer
Diagnose before prescribing. Be direct — don't hedge without following up with the actual answer. Use real numbers. Flag when something needs escalation (Aspergillus near harvest, root aphids at scale, systemic Botrytis in late flower). Don't moralize about cannabis — this is a licensed industry and these are professionals. Format for readability — bullets for diagnosis/checklists, prose for explanations. Don't pad responses.`,

  "post-harvest": `You are the post-harvest intelligence engine for ResinOps, a professional cannabis operations platform. Your knowledge spans commercial drying, bucking, trimming, and curing operations across licensed facilities of all scales — from boutique craft rooms to large MSO throughput environments.

## Who You're Talking To
Users range from trim techs on their first commercial job to post-harvest managers and directors of operations running multi-room schedules. Calibrate accordingly: a trim tech asking how to hand trim faster needs technique, ergonomics, and pacing tips. A post-harvest manager asking about throughput per labor hour, machine comparisons, or dry room environment targets wants numbers and operational logic. Never be condescending — post-harvest is where many people enter the industry and the knowledge floor varies widely.

## Drying

### Environment Fundamentals
Target finished flower at 10–13% moisture content and water activity (Aw) below 0.65 for mold safety in storage. Water activity meters (Aqualab, Rotronic) are the gold standard — more reliable than moisture % alone for contamination risk assessment. Standard dry room targets: 60°F / 60% RH, airflow without direct fan contact on buds, total darkness. Duration: 10–14 days for whole-plant hang, 7–10 days for bucked and racked material depending on density and cultivar.

### Whole-Plant Hang Drying
Hanging entire plants or large branches from the stem. Gold standard for premium product. The stem and remaining fan leaf act as a moisture buffer, slowing drying and creating more even cure onset. Better terpene preservation. More labor at harvest, more room required. Favored by craft and premium operators.

### Bucked and Racked Drying
Flower bucked from stems prior to drying and laid on mesh drying racks or hung in net bags. Faster dry time, less room space per pound. More accessible for large-volume operations. Increased surface area means faster terpene volatilization — mitigated by keeping temps low and humidity stable.

### Accelerated / Elevated Temperature Drying
Running dry rooms at higher temperatures (68–75°F+) with adjusted RH (45–55%) compresses the drying window to 5–7 days. Some operations push to 80–85°F for 3–5 day turnarounds. Trade-offs: faster turnaround increases room utilization and cash flow; monoterpene loss increases meaningfully above 70°F — limonene, myrcene, and pinene volatilize faster than sesquiterpenes; chlorophyll breakdown accelerates, which can improve smoothness but risks grassy/hay aroma if not managed; Botrytis risk increases if RH is not tightly controlled as temps rise. Best application: high-volume programs where throughput matters more than terpene ceiling, or extraction-destined material. Not recommended for premium whole-flower or connoisseur-positioned product.

### Freeze Drying (Lyophilization)
Primarily used for fresh-frozen material destined for solventless extraction. Removes moisture via sublimation rather than evaporation — preserves terpenes and color extremely well. Equipment cost is significant. Increasingly explored for finished flower preservation. Texture is different from conventionally dried flower; market acceptance varies.

### Dry Room Infrastructure
Dedicated HVAC with dehumidification sized to the moisture load introduced at harvest — undersized dehu is the most common failure point. Horizontal oscillating fans for room circulation without direct bud contact. Negative pressure preferred to contain odor and prevent cross-contamination. Temperature and RH logging with calibrated sensors (Govee, Inkbird, or facility-grade data loggers). Total darkness or UV-filtered lighting during access — UV degrades cannabinoids and terpenes.

## Bucking

Bucking is separation of flower from stem. Can happen pre-dry (wet buck) or post-dry (dry buck).

**Wet bucking:** Done immediately post-harvest while plant material is still moist and pliable. Easier on flower structurally. Speeds dry time by increasing surface area. Lower trichome damage risk when flower is wet and resilient. Preferred in humid climates where whole-plant hang increases Botrytis risk.

**Dry bucking:** Done after drying. Trichomes are brittle — requires gentler technique and machine settings. Produces kief fallout — collect it. Preferred for premium product and connoisseur positioning.

### Hand Bucking
An experienced bucker moves 8–15 lbs of wet material per hour depending on structure. Gentler on trichomes than any machine. Not scalable for large harvests. Best for small-batch craft or finishing touches on premium lines. Technique: support the branch, strip upward against bud direction. Work in sections. Clean tray beneath to catch fallout.

### Automated Bucking Machines
- **Centurion Pro:** Most widely used commercial bucker. Adjustable rollers, handles a range of stem diameters. Gentle enough for dry material if settings are adjusted.
- **Mobius MB65:** High throughput, clean separation. Popular in large commercial operations. Pairs with the M108S trimmer for integrated line setups. Feed rate matters — overfeeding causes jams and damage.
- **Twister B2:** Compact, solid throughput for mid-size operations. Integrates with T4/T6 trimmer line.
- **Tom's Tumble Trimmer attachments / standalone:** Budget-accessible, lower throughput, good for smaller operations.
- **iPower / generic:** Entry-level price point, adequate for smaller harvests. Variable QC — inspect rollers carefully.

**Best practices:** Feed rate controls output quality more than machine brand. Clean rollers frequently during a run — resin buildup causes uneven separation. Dry material: reduce roller pressure or gap to minimize trichome shatter. Never force oversized stems. Have a collection bin under the output — kief accumulates fast.

## Trimming

### Wet Trim vs. Dry Trim
**Wet trim** (before drying): Easier scissors work — leaves are pliable and flat. Faster dry time. Risk of terpene volatilization starting immediately once cut. Preferred in humid climates and for high-volume outdoor/greenhouse. More common at scale.

**Dry trim** (after drying): Sugar leaves protect the bud through the dry. Better terpene preservation. Harder to execute — dried leaves curl under, scissors gum up fast and require frequent cleaning. Preferred for premium indoor flower. Higher labor cost per pound.

### Hand Trimming
The quality ceiling. Nothing produces cleaner, more precisely manicured product than trained hands with sharp scissors. Labor cost: $150–300+ per pound depending on market wages and cultivar structure.

**Best practices:** Sharp scissors are non-negotiable — Fiskars, Chikamasa, or Harvest More; clean with ISO every 30–45 minutes on dry trim runs; gummed scissors tear trichomes and bruise flower. Trimming tray with kief screen beneath — collect everything. Minimize handling — every unnecessary touch removes trichomes. Nitrile gloves. Ergonomics: wrist injuries (carpal tunnel, tendonitis) are the number one post-harvest occupational injury — tray height, scissor fit, and break schedules are a real management responsibility. Define quality standards before a run starts with a physical reference sample — don't assume. Throughput benchmarks: 1.5–3 lbs/day per trimmer on wet, 0.75–1.5 lbs/day on dry depending on cultivar density and standard.

### Trim Machines

**Tumble-style (drum/barrel):** Flower tumbles inside a rotating mesh drum. Leaves pass through the mesh, buds stay in. Gentle. Best for dry material. Risk of over-trimming with extended run time — set a timer, check frequently.
- *Tom's Tumble Trimmer:* Long-standing industry workhorse. Multiple sizes. Gentle, reliable. Good for small-to-mid operations.
- *GreenBroz / Eteros 215:* Very gentle tumble action, good trichome preservation. Popular in premium operations wanting machine efficiency without sacrificing quality.
- *Triminator Dry:* Good throughput, easy cleanup, reasonable gentleness.

**Bowl-style:** Flower sits in a bowl with a spinning blade below. More precise for some structures. Good for dry material.
- *Mobius M108S:* Premium commercial option. High throughput (up to 150 lbs/hr claimed — real-world varies). Integrates with the MB65 bucker for continuous line operation. Gentle on trichomes when dialed correctly. Significant capital cost — justifiable at scale.

**Conveyor/blade-style:** Flower moves through a conveyor with spinning blades. Higher throughput, less gentle — more trichome loss and occasional bruising. Best for extraction-destined material or high-volume programs where throughput matters more than trichome integrity.
- *Twister T4/T6:* Widely used commercial workhorses. High throughput. Pairs with the B2 bucker. Not as gentle as tumble or bowl machines. Can be used on premium product if dialed carefully and run time is short.

**General machine best practices:** Never over-fill — quality output comes from running under stated capacity. Moisture content at trim time matters: slightly higher moisture (13–15%) produces better results than bone-dry. Run a small test batch with each new cultivar — airy and dense structures require different settings and timing. Clean after every run. Machine trim + hand finish is a legitimate strategy: machines remove bulk work, hand trimmers clean up. Collect all trim — sugar leaf has extraction value; know your downstream before composting anything.

## Curing

Curing is the controlled, slow continuation of biochemical processes post-harvest — chlorophyll breakdown, moisture equalization, and terpene preservation. It is not optional for premium product.

### Environment Targets
RH: 58–65% during active cure; 62% is the widely accepted sweet spot. Temperature: 60–70°F — cooler is better, terpenes are volatile. Total darkness — UV and visible light degrade cannabinoids over time. Minimal airflow — you're equalizing moisture, not removing it aggressively.

### Traditional Cure (Glass Jars)
Wide-mouth mason jars, filled 75% — flower needs room to breathe. Burp (open lids) for 10–15 minutes daily for the first 1–2 weeks to release accumulated CO2 and ethylene. Reduce to every few days in weeks 3–4. If RH inside reads above 70%, leave lids off for an hour and re-check. If below 55%, add a Boveda or Integra pack. Duration: minimum 2 weeks. 4–6 weeks for notably improved product. 8+ weeks for premium. Chlorophyll breakdown is ongoing — a harsh, grassy note at week 2 often becomes smooth and floral by week 6.

### Commercial Curing Vessels
- **Grove Bags:** The most significant commercial curing innovation of the last decade. Terploc film — a one-way permeable membrane that allows CO2 and ethylene out while maintaining target humidity without burping. Sizes from 1 lb to 100 lb turkey bags. No burping required when loaded at proper moisture (recommended: 13–15%). Dramatically reduces cure labor cost. Widely adopted in licensed markets. Not a replacement for slow cure in terms of quality ceiling, but operationally superior for most commercial programs.
- **CVault / metal humidity containers:** Stainless steel with Boveda pack integration. Good for mid-scale, easy to stack and inspect.
- **Humidity-controlled cure rooms:** Dedicated rooms held at target RH and temp. Flower cures in open bins or bulk containers within the controlled space. Consistent results at scale.

### Water Activity Monitoring
Water activity (Aw) is the industry standard for microbial safety — more meaningful than moisture % for predicting mold risk. Target: Aw below 0.65 for safe long-term storage. Most state testing labs test Aw as part of compliance panels. Aqualab meters (Decagon) are the industry standard for in-house testing. Rotronic is another reliable brand. Moisture content and water activity are related but not the same — test both when establishing production standards.

### Curing for Different End Uses
- **Retail flower:** Full cure, 4–8 weeks minimum for premium. Terpene preservation and smoothness are the priority.
- **Pre-roll:** Slightly drier is acceptable, typically 10–12% moisture. Machine filling requires consistent moisture — too wet causes packing issues, too dry causes crumbling.
- **Solvent extraction feedstock:** Cure matters less. Throughput and potency are the priority.
- **Solventless feedstock (ice water / rosin):** Fresh frozen is increasingly preferred — harvest and freeze immediately, skip dry and cure entirely. Dried and cured material can still be pressed; moisture content affects pressing performance.

### Common Curing Mistakes
Too fast (too dry, too warm, too much airflow) produces harsh, one-dimensional flavor. Starting cure too wet (above 15%) without Grove Bags or active monitoring creates Botrytis risk. Inconsistent burping creates off-notes and slows the process. Curing in ambient light degrades cannabinoids and terpenes. Not separating batches by cultivar and harvest lot is a compliance and quality tracking problem.

## How to Answer
Be specific. Operators making post-harvest decisions balance quality, throughput, and labor cost — when those factors are in tension, say so and let them decide what they're optimizing for. Use real numbers for throughput, duration targets, and environmental parameters. If someone asks about a specific machine, give an honest operational assessment, not a brochure. Flag contamination or Aw risk and recommend QC escalation. Don't moralize — these are licensed professionals doing their jobs.`,
};

// ── Suggested Questions ───────────────────────────────────────────────────────
const SUGGESTIONS = {
  "post-harvest": [
    "We're running a commercial dry room at 60/60 but the center of the room is reading 68% RH three days in. What's happening and how do I fix it?",
    "What's the honest trade-off between running a Twister T6 vs. a Mobius M108S for a 200 lb/week dry weight operation?",
    "We're trying to cut our drying time from 12 days to 7. Walk me through how to do that without wrecking terpenes.",
    "What should our hand trim throughput standard be for dry trimming dense indoor flower and how do we hold people to it?",
  ],
  facility: [
    "My flower room dehu is short cycling — runs for a few minutes, shuts off, repeats. What's the diagnostic checklist?",
    "I'm building out a 5,000 sq ft flower room with 50 x 1000W HPS. Walk me through how to size the electrical service and HVAC.",
    "What's the real difference between running a Quest Intelliclimate vs. separate mini-splits plus standalone dehu units in a commercial flower room?",
    "My dry room is hitting 72% RH two days after loading wet flower even with the dehu running constantly. What's going on?",
  ],
  extraction: [
    "We're running BHO on fresh frozen and our live resin is coming out darker than expected. What are the most likely causes and how do I dial it in?",
    "Walk me through the difference between running a cold column passive dewax vs. inline active chilling for BHO — when does each make sense?",
    "What are realistic yield expectations pressing 4-star fresh frozen bubble hash into live rosin, and what parameters should I start with?",
    "We're getting residual solvent failures on our BHO — coming in over state limits on butane. What's the troubleshooting checklist?",
  ],
  cultivation: [
    "My plants in late flower are showing brown tips on the fan leaves. EC is at 2.4. What's most likely going on?",
    "What VPD should I be targeting for week 3 of flower in a sealed indoor room?",
    "I'm seeing small white specks on the tops of leaves. How do I figure out if it's spider mites, broad mites, or russet mites?",
    "Walk me through how to set up a dry-back schedule for coco in a commercial setting.",
  ],
};

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #0d0f0e;
    --surface:   #141714;
    --surface-2: #1a1e1a;
    --border:    #252925;
    --border-2:  #2e342e;
    --accent:    #4a7c59;
    --accent-2:  #6aab7a;
    --accent-glow: rgba(74,124,89,0.15);
    --text:      #e8ede9;
    --text-2:    #9ba89c;
    --text-3:    #636e64;
    --amber:     #c8963a;
    --danger:    #c84a4a;
    --mono:      'IBM Plex Mono', monospace;
    --sans:      'Inter', sans-serif;
    --radius:    10px;
  }

  :root[data-theme="light"] {
    --bg:        #f3f5f2;
    --surface:   #ffffff;
    --surface-2: #eceeeb;
    --border:    #dde1dc;
    --border-2:  #cbd1c9;
    --accent:    #3f7350;
    --accent-2:  #2e5c3d;
    --accent-glow: rgba(63,115,80,0.12);
    --text:      #1b201c;
    --text-2:    #4b564c;
    --text-3:    #7c877d;
    --amber:     #93650f;
    --danger:    #b23a3a;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.6;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Layout ── */
  .app { display: flex; height: 100vh; }

  /* ── Sidebar ── */
  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 20px 0;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .logo {
    padding: 0 20px 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }
  .logo-mark {
    font-family: var(--mono);
    font-size: 18px;
    font-weight: 500;
    color: var(--accent-2);
    letter-spacing: -0.5px;
  }
  .logo-sub {
    font-size: 10px;
    color: var(--text-3);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-top: 2px;
  }

  .sidebar-section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-3);
    padding: 0 20px 8px;
  }

  .sidebar-section-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-3);
    padding: 6px 20px;
    margin-top: 8px;
    transition: color 0.15s;
  }
  .sidebar-section-toggle:hover { color: var(--text-2); }
  .sidebar-section-chevron {
    display: inline-block;
    transition: transform 0.15s;
    font-size: 8px;
  }
  .sidebar-section-chevron.expanded { transform: rotate(90deg); }

  .module-btn {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 20px;
    cursor: pointer;
    border: none;
    background: none;
    width: 100%;
    text-align: left;
    transition: background 0.15s;
    position: relative;
  }
  .module-btn:hover:not(.locked) { background: var(--surface-2); }
  .module-btn.active { background: var(--accent-glow); }
  .module-btn.active::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    background: var(--accent-2);
    border-radius: 0 2px 2px 0;
  }
  .module-btn.locked { opacity: 0.4; cursor: not-allowed; }

  .module-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
  .module-info { flex: 1; min-width: 0; }
  .module-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .module-desc {
    font-size: 11px;
    color: var(--text-3);
    margin-top: 2px;
    line-height: 1.4;
  }
  .badge-soon {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: var(--surface-2);
    color: var(--text-3);
    border: 1px solid var(--border-2);
    border-radius: 4px;
    padding: 1px 5px;
  }

  .sidebar-footer {
    margin-top: auto;
    padding: 16px 20px 0;
    border-top: 1px solid var(--border);
  }
  .plan-badge {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--amber);
    border: 1px solid rgba(200,150,58,0.3);
    background: rgba(200,150,58,0.08);
    border-radius: 5px;
    padding: 3px 8px;
    display: inline-block;
    margin-bottom: 6px;
  }
  .plan-text { font-size: 11px; color: var(--text-3); line-height: 1.4; }

  /* ── Main ── */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  /* Force every module's top-level wrapper to respect flex shrink + scroll
     internally, rather than growing past the viewport and being clipped. */
  .main > div:not(.header) {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* ── Header ── */
  .header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    background: var(--surface);
  }
  .header-icon { font-size: 20px; }
  .header-title { font-size: 15px; font-weight: 600; color: var(--text); }
  .header-desc { font-size: 12px; color: var(--text-3); margin-top: 1px; }
  .header-status {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-3);
  }
  .status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--accent-2);
    box-shadow: 0 0 6px var(--accent-2);
  }

  /* ── Chat Area ── */
  .chat-area {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    scroll-behavior: smooth;
  }
  .chat-area::-webkit-scrollbar { width: 4px; }
  .chat-area::-webkit-scrollbar-track { background: transparent; }
  .chat-area::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 2px; }

  /* ── Welcome ── */
  .welcome {
    max-width: 640px;
    margin: 0 auto;
    width: 100%;
    padding-top: 8px;
  }
  .welcome-heading {
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
    line-height: 1.3;
  }
  .welcome-heading span { color: var(--accent-2); }
  .welcome-sub {
    font-size: 13px;
    color: var(--text-2);
    margin-bottom: 24px;
    line-height: 1.6;
  }
  .suggestions-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-3);
    margin-bottom: 10px;
  }
  .suggestions { display: flex; flex-direction: column; gap: 8px; }
  .suggestion-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 11px 14px;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-2);
    font-family: var(--sans);
    line-height: 1.5;
    transition: all 0.15s;
  }
  .suggestion-btn:hover {
    border-color: var(--accent);
    color: var(--text);
    background: var(--accent-glow);
  }

  /* ── Messages ── */
  .messages { display: flex; flex-direction: column; gap: 20px; max-width: 760px; margin: 0 auto; width: 100%; }

  .message { display: flex; gap: 12px; align-items: flex-start; }
  .message.user { flex-direction: row-reverse; }

  .avatar {
    width: 30px; height: 30px;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
    font-weight: 600;
  }
  .avatar.ai {
    background: var(--accent-glow);
    border: 1px solid var(--accent);
    color: var(--accent-2);
    font-family: var(--mono);
    font-size: 11px;
  }
  .avatar.user-av {
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--text-2);
  }

  .bubble {
    max-width: calc(100% - 50px);
    padding: 12px 15px;
    border-radius: 12px;
    font-size: 13.5px;
    line-height: 1.65;
  }
  .bubble.ai {
    background: var(--surface);
    border: 1px solid var(--border);
    border-top-left-radius: 4px;
    color: var(--text);
  }
  .bubble.user-bubble {
    background: var(--accent-glow);
    border: 1px solid var(--accent);
    border-top-right-radius: 4px;
    color: var(--text);
  }

  .bubble p { margin-bottom: 10px; }
  .bubble p:last-child { margin-bottom: 0; }
  .bubble ul, .bubble ol { margin: 8px 0 8px 18px; }
  .bubble li { margin-bottom: 5px; }
  .bubble strong { color: var(--accent-2); font-weight: 600; }
  .bubble code {
    font-family: var(--mono);
    font-size: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 4px;
    padding: 1px 5px;
    color: var(--accent-2);
  }
  .bubble h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent-2);
    margin: 12px 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .bubble h3:first-child { margin-top: 0; }

  /* ── Typing indicator ── */
  .typing {
    display: flex; gap: 4px; align-items: center; padding: 4px 0;
  }
  .typing span {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: bounce 1.2s infinite;
  }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
    40% { transform: translateY(-5px); opacity: 1; }
  }

  /* ── Input Area ── */
  .input-area {
    padding: 16px 24px 20px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--surface);
  }
  .input-wrap {
    max-width: 760px;
    margin: 0 auto;
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }
  .textarea-wrap { flex: 1; position: relative; }
  textarea {
    width: 100%;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--sans);
    font-size: 13.5px;
    line-height: 1.5;
    padding: 11px 14px;
    resize: none;
    outline: none;
    min-height: 44px;
    max-height: 160px;
    transition: border-color 0.15s;
  }
  textarea::placeholder { color: var(--text-3); }
  textarea:focus { border-color: var(--accent); }

  .send-btn {
    width: 44px; height: 44px;
    background: var(--accent);
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;
    color: white;
  }
  .send-btn:hover { background: var(--accent-2); }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .send-btn svg { width: 18px; height: 18px; }

  .input-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 760px;
    margin: 8px auto 0;
  }
  .input-hint { font-size: 11px; color: var(--text-3); }
  .export-hint {
    font-size: 10px;
    color: var(--text-3);
    font-style: italic;
  }
  .clear-btn {
    font-size: 11px;
    color: var(--text-3);
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--sans);
    padding: 0;
  }
  .clear-btn:hover { color: var(--text-2); }


  .attach-btn {
    width: 44px; height: 44px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: var(--radius);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    color: var(--text-3);
    transition: all 0.15s;
  }
  .attach-btn:hover { border-color: var(--accent); color: var(--accent-2); }
  .attach-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .image-preview-bar {
    display: flex; align-items: center; gap: 10px;
    max-width: 760px; margin: 0 auto 10px;
    padding: 8px 12px;
    background: var(--surface-2);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
  }
  .image-preview-wrap { position: relative; flex-shrink: 0; }
  .image-thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 6px; display: block; }
  .image-remove {
    position: absolute; top: -6px; right: -6px;
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--danger); border: none; color: white;
    font-size: 12px; cursor: pointer; display: flex;
    align-items: center; justify-content: center; line-height: 1;
  }
  .image-preview-label { font-size: 12px; color: var(--text-2); }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .sidebar { position:fixed;left:0;top:0;bottom:0;z-index:200;transform:translateX(-100%);transition:transform 0.25s ease;box-shadow:4px 0 20px rgba(0,0,0,0.3); }
    .sidebar.mobile-open { transform:translateX(0); }
    .main-content { margin-left:0!important; }
    .mobile-overlay { display:block!important;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:199; }
    .hamburger-btn { display:flex!important; }
    .chat-area { padding: 16px; }
    .input-area { padding: 12px 16px 16px; }
  }
  .mobile-overlay { display:none; }
  .hamburger-btn { display:none;align-items:center;justify-content:center;width:36px;height:36px;border:none;border-radius:8px;background:var(--surface-2);cursor:pointer;color:var(--text);font-size:18px; }

  /* User menu */
  .theme-toggle-btn{display:flex;align-items:center;justify-content:center;width:32px;height:32px;margin-left:auto;flex-shrink:0;background:var(--surface-2);border:1px solid var(--border-2);border-radius:10px;cursor:pointer;color:var(--text-2);font-size:14px;transition:all 0.15s;}
  .theme-toggle-btn:hover{color:var(--text);border-color:var(--accent);}
  .user-menu-wrap{position:relative;flex-shrink:0;margin-left:10px;}
  .user-menu-btn{display:flex;align-items:center;gap:8px;background:var(--surface-2);border:1px solid var(--border-2);border-radius:10px;padding:6px 12px 6px 8px;cursor:pointer;color:var(--text-2);font-family:var(--sans);font-size:12px;transition:all 0.15s;}
  .user-menu-btn:hover{border-color:var(--accent);color:var(--text);}
  .user-avatar-sm{width:28px;height:28px;border-radius:7px;background:var(--accent-glow);border:1px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--accent-2);font-weight:600;}
  .user-dropdown{position:absolute;top:calc(100% + 6px);right:0;background:var(--surface);border:1px solid var(--border-2);border-radius:10px;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.4);z-index:500;overflow:hidden;}
  .user-dropdown-header{padding:12px 14px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-3);}
  .user-dropdown-header strong{display:block;color:var(--text);font-size:13px;margin-bottom:2px;}
  .user-dropdown-item{display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:13px;color:var(--text-2);cursor:pointer;border:none;background:none;width:100%;text-align:left;font-family:var(--sans);transition:background 0.1s;}
  .user-dropdown-item:hover{background:var(--surface-2);color:var(--text);}
  .user-dropdown-item.danger{color:var(--danger);}
  .user-dropdown-item.danger:hover{background:rgba(200,74,74,0.1);}
  .user-dropdown-divider{height:1px;background:var(--border);margin:0;}

  /* Account settings modal */
  .acct-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:600;display:flex;align-items:center;justify-content:center;}
  .acct-modal{background:var(--surface);border:1px solid var(--border-2);border-radius:14px;width:100%;max-width:440px;padding:28px;box-shadow:0 12px 48px rgba(0,0,0,0.5);}
  .acct-title{font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;}
  .acct-sub{font-size:12px;color:var(--text-3);margin-bottom:20px;}
  .acct-field{margin-bottom:14px;}
  .acct-lbl{display:block;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;}
  .acct-inp{width:100%;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-size:13px;font-family:var(--sans);outline:none;box-sizing:border-box;}
  .acct-inp:focus{border-color:var(--accent);}
  .acct-btn{padding:10px 20px;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--sans);}
  .acct-btn.primary{background:var(--accent);color:#fff;}
  .acct-btn.secondary{background:var(--surface-2);border:1px solid var(--border-2);color:var(--text-2);}
  .acct-msg{font-size:12px;margin-top:8px;}
  .acct-msg.ok{color:var(--accent-2);}
  .acct-msg.err{color:var(--danger);}
`;


// ── Markdown-lite renderer ────────────────────────────────────────────────────
function renderMarkdown(text) {
  const lines = text.split("\n");
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      result.push(<h3 key={i}>{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      result.push(<h3 key={i}>{line.slice(3)}</h3>);
    } else if (line.match(/^[-*] /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(<li key={i}>{renderInlineMarkdown(lines[i].slice(2), `ul-${i}`)}</li>);
        i++;
      }
      result.push(<ul key={`ul-${i}`}>{items}</ul>);
      continue;
    } else if (line.match(/^\d+\. /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(<li key={i}>{renderInlineMarkdown(lines[i].replace(/^\d+\. /, ""), `ol-${i}`)}</li>);
        i++;
      }
      result.push(<ol key={`ol-${i}`}>{items}</ol>);
      continue;
    } else if (line.trim() !== "") {
      result.push(<p key={i}>{renderInlineMarkdown(line, `p-${i}`)}</p>);
    }
    i++;
  }
  return result;
}

function renderInlineMarkdown(text, keyPrefix) {
  return tokenizeInlineMarkdown(text).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.type === 'strong') return <strong key={key}>{token.value}</strong>;
    if (token.type === 'code') return <code key={key}>{token.value}</code>;
    if (token.type === 'em') return <em key={key}>{token.value}</em>;
    return <span key={key}>{token.value}</span>;
  });
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ResinOps() {
  const [activeModule, setActiveModule] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardVersion, setDashboardVersion] = useState(0);
  const [productTier, setProductTier] = useState("commercial");
  const [moduleOverrides, setModuleOverrides] = useState({});
  const [collapsedSections, setCollapsedSections] = useState(()=>{
    try{
      const saved = JSON.parse(localStorage.getItem("resinops_nav_collapsed"));
      return new Set(Array.isArray(saved) ? saved : ALL_SECTION_NAMES);
    }catch{ return new Set(ALL_SECTION_NAMES); }
  });
  function toggleSection(name){
    setCollapsedSections(prev=>{
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      localStorage.setItem("resinops_nav_collapsed", JSON.stringify([...next]));
      return next;
    });
  }

  const [theme, setTheme] = useState(()=>{
    try{ return localStorage.getItem("resinops_theme") === "light" ? "light" : "dark"; }
    catch{ return "dark"; }
  });
  useEffect(()=>{
    document.documentElement.setAttribute("data-theme", theme);
    try{ localStorage.setItem("resinops_theme", theme); }catch{}
  },[theme]);

  // Facility product tier + per-module visibility overrides — see
  // src/lib/moduleVisibility.js. facilities isn't in dbTransforms'
  // SCHEMAS list, so columns pass straight through (same pattern
  // FacilitySettings.jsx already uses).
  useEffect(()=>{
    async function loadModuleVisibility(){
      const fid = getCurrentFacility();
      if (isSupabaseEnabled && fid) {
        try{
          const { data } = await supabase.from('facilities').select('product_tier,module_overrides').eq('id', fid).single();
          if (data) {
            setProductTier(data.product_tier || "commercial");
            setModuleOverrides(data.module_overrides || {});
          }
        }catch(e){ console.error("Module visibility load error:", e); }
      } else if (!isSupabaseEnabled) {
        try{
          const s = JSON.parse(localStorage.getItem("resinops_facility_settings")||"{}");
          setProductTier(s.productTier || "commercial");
          setModuleOverrides(s.moduleOverrides || {});
        }catch{}
      }
    }
    loadModuleVisibility();
  },[]);

  // If a module gets hidden (tier switched, or an override flips off)
  // while it's the active one, don't leave the user stranded on a page
  // that's no longer in the nav.
  useEffect(()=>{
    const mod = MODULES.find(m => m.id === activeModule);
    if (mod && !isModuleVisible(mod, productTier, moduleOverrides)) {
      setActiveModule("dashboard");
    }
  },[productTier, moduleOverrides, activeModule]);
  const [showOnboarding, setShowOnboarding] = useState(()=>{
    return !localStorage.getItem("resinops_onboarding_complete");
  });
  const [onboardStep, setOnboardStep] = useState(0);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [acctTab, setAcctTab] = useState("profile"); // profile | password
  const [acctNewEmail, setAcctNewEmail] = useState("");
  const [acctCurrentPw, setAcctCurrentPw] = useState("");
  const [acctNewPw, setAcctNewPw] = useState("");
  const [acctConfirmPw, setAcctConfirmPw] = useState("");
  const [acctMsg, setAcctMsg] = useState({text:"",type:""});
  const [acctLoading, setAcctLoading] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const userMenuRef = useRef(null);

  // Load user email on mount
  useEffect(() => {
    if (isSupabaseEnabled) {
      auth.getUser().then(u => { if(u?.email) setUserEmail(u.email); });
    }
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    function handler(e) { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSignOut() {
    await auth.signOut();
    window.location.reload();
  }

  async function handleUpdateEmail() {
    if (!acctNewEmail.trim()) { setAcctMsg({text:"Enter a new email.",type:"err"}); return; }
    setAcctLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: acctNewEmail });
      if (error) throw error;
      setAcctMsg({text:"Confirmation email sent to your new address. Check your inbox.",type:"ok"});
      setAcctNewEmail("");
    } catch(e) { setAcctMsg({text:e.message,type:"err"}); }
    setAcctLoading(false);
  }

  async function handleChangePassword() {
    if (!acctCurrentPw) { setAcctMsg({text:"Enter your current password.",type:"err"}); return; }
    const validationError = passwordValidationError(acctNewPw, acctConfirmPw);
    if (validationError) { setAcctMsg({text:validationError,type:"err"}); return; }
    setAcctLoading(true);
    try {
      const { error } = await auth.updatePassword(acctNewPw, acctCurrentPw);
      if (error) throw error;
      setAcctMsg({text:"Password updated successfully.",type:"ok"});
      setAcctCurrentPw(""); setAcctNewPw(""); setAcctConfirmPw("");
    } catch(e) { setAcctMsg({text:e.message,type:"err"}); }
    setAcctLoading(false);
  }

  const switchModule = (id) => {
    const mod = MODULES.find((m) => m.id === id);
    if (!mod?.available) return;
    if(window.__resinopsUnsaved && activeModule !== id) {
      if(!window.confirm("You have unsaved changes. Leave anyway?")) return;
      window.__resinopsUnsaved = false;
    }
    setActiveModule(id);
    if(id==="dashboard") setDashboardVersion(v=>v+1);
    setMessages([]);
    setImage(null);
    setSidebarOpen(false);
  };

  const currentModule = MODULES.find((m) => m.id === activeModule);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const autoResize = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const mediaType = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result.split(',')[1];
      setImage({ base64, mediaType, preview: ev.target.result });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeImage = () => setImage(null);

  const exportChat = () => {
    if (messages.length === 0) return;
    const mod = MODULES.find(m => m.id === activeModule);
    const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const fmtText = (raw) => {
      const lines = raw.split('\n');
      let out = '';
      let inList = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isBullet = line.startsWith('- ') || line.startsWith('* ');
        if (isBullet) {
          if (!inList) { out += '<ul>'; inList = true; }
          const inner = esc(line.slice(2)).split('**').map((s, j) => j % 2 === 1 ? '<strong>' + s + '</strong>' : s).join('');
          out += '<li>' + inner + '</li>';
        } else {
          if (inList) { out += '</ul>'; inList = false; }
          if (line.startsWith('### ')) { out += '<h4>' + esc(line.slice(4)) + '</h4>'; }
          else if (line.startsWith('## ')) { out += '<h3>' + esc(line.slice(3)) + '</h3>'; }
          else if (line.trim() === '') { out += '<br>'; }
          else {
            const inner = esc(line).split('**').map((s, j) => j % 2 === 1 ? '<strong>' + s + '</strong>' : s).join('');
            out += '<p>' + inner + '</p>';
          }
        }
      }
      if (inList) out += '</ul>';
      return out;
    };

    const rows = messages.map(msg => {
      const isUser = msg.role === 'user';
      const text = typeof msg.content === 'string' ? msg.content : (msg.displayText || '');
      const imgTag = msg.preview ? '<p><em>[Image attached]</em></p>' : '';
      const body = imgTag + (isUser ? '<p>' + esc(text) + '</p>' : fmtText(text));
      return '<div class="msg"><div class="who ' + (isUser ? 'user' : 'ai') + '">'
        + (isUser ? 'You' : 'ResinOps AI')
        + '</div><div class="body">' + body + '</div></div>';
    }).join('<hr>');

    const title = (mod?.label || 'Chat') + ' — ' + date;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${esc(title)}</title><style>
      body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222;}
      h1{font-size:20px;margin:0 0 4px;color:#1a3a28;}
      .subtitle{color:#888;font-size:13px;margin-bottom:24px;}
      .msg{margin-bottom:20px;}
      .who{font-weight:700;margin-bottom:6px;font-size:13px;}
      .who.user{color:#1a3a28;}.who.ai{color:#4a7c59;}
      .body p{margin:0 0 8px;}.body ul{margin:8px 0;padding-left:24px;}.body h3{font-size:16px;margin:16px 0 8px;}.body h4{font-size:14px;margin:14px 0 6px;}
      hr{border:none;border-top:1px solid #ddd;margin:20px 0;}
    </style></head><body>
      <h1>${esc(mod?.label || 'Chat')}</h1>
      <div class="subtitle">${esc(date)}</div>
      ${rows}
    </body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ResinOps-' + (mod?.label || 'Chat').replace(/\s+/g, '-') + '-' + new Date().toISOString().slice(0,10) + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };



  const send = async (text) => {
    const query = (text || input).trim();
    if ((!query && !image) || loading) return;

    let userContent;
    if (image) {
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
        { type: 'text', text: query || 'What do you see in this image?' },
      ];
    } else {
      userContent = query;
    }

    const userMsg = { role: 'user', content: userContent, preview: image?.preview || null, displayText: query };
    const newMessages = [...messages, { role: 'user', content: userContent }];
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const res = await authenticatedApiFetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: 'general-chat',
          system: "You are an expert cannabis operations consultant with 25 years of experience across cultivation, extraction, processing, compliance, and business management. You have deep knowledge of NY OCM regulations, NY DEC pesticide requirements, METRC, extraction methods (R-134a, CO2, hydrocarbon, ethanol, solventless), GMP practices, and cannabis business operations. Answer questions clearly and specifically. When relevant, reference NY-specific regulations, licensing requirements, and best practices for licensed cannabis operators.",
          prompt: query,
          history: messages.filter(m => typeof m.content === 'string').slice(-10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(res, data, 'AI request failed'));
      const reply = data.content?.map((b) => b.text || '').join('') || 'Something went wrong. Please try again.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: error?.message || 'Connection error. Check your network and try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isSchedulerActive = ["dashboard","ops-analyst","scheduler","production","yield-dashboard","harvest","remediation","grow-map","clone-scheduler","mother-plants","pheno-hunt","strain-db","tc-tracker","cult-inputs","spray-log","ipm-tracker","qc-testing","gmp-hub","metrc","employees","batch-dashboard","labor-setup","labor-dash","inventory","finance","equipment","facility-map","maintenance","sales","customers","data-manager","facility-settings"].includes(activeModule);
  const isAIChat = activeModule === "ai-chat";

  const showWelcome = messages.length === 0;

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* ── Onboarding wizard ── */}
      {showOnboarding&&(()=>{
        const steps=[
          {icon:"🌿",title:"Welcome to ResinOps",subtitle:"Cannabis operations software built by operators",body:"ResinOps connects every part of your licensed operation — cultivation, processing, compliance, lab results, sales, and financials — in one platform built for how cannabis businesses actually work.",action:"Get started →"},
          {icon:"🏭",title:"Set up your facility",subtitle:"Tell ResinOps about your operation",body:"Start by loading your facility settings. If you're exploring the demo, click \"Load demo facility\" to instantly populate Cascade Peak Cannabis LLC — a fully-configured NY OCM licensed cultivator — so you can see the full platform in action.",action:"Continue →",secondary:{label:"Load demo facility",fn:()=>{localStorage.setItem("resinops_facility_settings",JSON.stringify({facilityName:"Cascade Peak Cannabis LLC",licenseNumber:"OCM-AUPR-007891",licenseType:"Adult-Use Cultivator",state:"NY",city:"Tuxedo",address:"1220 Route 17M",zip:"10987"}));}}},
          {icon:"✨",title:"Import your data with AI",subtitle:"Drop any file — we handle the rest",body:"Go to Data & Imports and drop any CSV, Excel, or PDF from your existing systems. ResinOps AI reads your column headers automatically and maps everything to the right fields — employees, harvest records, COA results, sales orders, pesticide logs, and more.",action:"Continue →"},
          {icon:"📊",title:"Your dashboard updates live",subtitle:"Everything connected, always current",body:"After importing your data, your operations dashboard shows confirmed revenue, pending pipeline, upcoming harvests, compliance alerts, and strain performance — all in one view. Navigate back to Dashboard any time to see your current state.",action:"Let's go →"},
        ];
        const step=steps[onboardStep];
        const isLast=onboardStep===steps.length-1;
        return(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>
            <div style={{background:"var(--surface)",borderRadius:16,padding:"40px 44px",maxWidth:520,width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,0.5)",border:"1px solid var(--border-2)",position:"relative"}}>
              <button onClick={()=>{localStorage.setItem("resinops_onboarding_complete","1");setShowOnboarding(false);}} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:"var(--text-3)",fontSize:18,cursor:"pointer"}}>✕</button>
              <div style={{textAlign:"center",marginBottom:24}}>
                <div style={{fontSize:48,marginBottom:12}}>{step.icon}</div>
                <div style={{fontSize:20,fontWeight:700,color:"var(--text)",marginBottom:6}}>{step.title}</div>
                <div style={{fontSize:13,color:"var(--accent-2)",fontWeight:600,marginBottom:16}}>{step.subtitle}</div>
                <div style={{fontSize:13,color:"var(--text-2)",lineHeight:1.6}}>{step.body}</div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexDirection:"column",alignItems:"center"}}>
                <button style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:10,padding:"12px 32px",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%"}} onClick={()=>{
                  if(isLast){localStorage.setItem("resinops_onboarding_complete","1");setShowOnboarding(false);switchModule("dashboard");}
                  else setOnboardStep(s=>s+1);
                }}>{step.action}</button>
                {step.secondary&&<button style={{background:"rgba(90,63,160,0.15)",color:"#9080f0",border:"1px solid rgba(90,63,160,0.3)",borderRadius:10,padding:"10px 24px",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%"}} onClick={()=>{step.secondary.fn();setOnboardStep(s=>s+1);}}>{step.secondary.label}</button>}
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  {steps.map((_,i)=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:i===onboardStep?"var(--accent)":"var(--border-2)"}}/>)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mobile overlay */}
        {sidebarOpen&&<div className="mobile-overlay" onClick={()=>setSidebarOpen(false)}/>}
        {/* Hamburger button — only visible on mobile */}
        <button className="hamburger-btn" style={{position:"fixed",top:14,left:14,zIndex:201}} onClick={()=>setSidebarOpen(o=>!o)}>
          {sidebarOpen?"✕":"☰"}
        </button>
        {/* ── Sidebar ── */}
        <aside className={`sidebar${sidebarOpen?" mobile-open":""}`}>
          <div className="logo">
            <div className="logo-mark">ResinOps</div>
            <div className="logo-sub">Built by operators. Powered by data.</div>
          </div>

          {/* ── Dashboard pinned at top ── */}
          <button
            className={`module-btn ${activeModule === "dashboard" ? "active" : ""}`}
            onClick={() => switchModule("dashboard")}
            style={{marginBottom:4}}
          >
            <span className="module-icon">🏠</span>
            <span className="module-info">
              <span className="module-name">Dashboard</span>
              <span className="module-desc">Today's alerts & activity</span>
            </span>
          </button>

          {/* ── AI Assistant pinned under Dashboard ── */}
          <button
            className={`module-btn ${isAIChat || (!isSchedulerActive && activeModule !== "dashboard") ? "active" : ""}`}
            onClick={() => { setActiveModule("ai-chat"); setMessages([]); setImage(null); }}
            style={{marginBottom:4}}
          >
            <span className="module-icon">🤖</span>
            <span className="module-info">
              <span className="module-name">AI Assistant</span>
              <span className="module-desc">Cannabis operations expert</span>
            </span>
          </button>

          <div style={{margin:"6px 0",borderTop:"1px solid var(--border)"}}/>

          {/* ── All operational modules, grouped into collapsible accordion sections ── */}
          {(() => {
            const visible = MODULES.filter(m =>
              m.isScheduler && m.id !== "dashboard" && m.id !== "data-manager" && m.id !== "facility-settings" && m.id !== "metrc"
              && isModuleVisible(m, productTier, moduleOverrides)
            );
            // Group in-order: a truthy sectionBreak starts a new (possibly
            // headerless, for sectionBreak:null) section; everything after
            // it belongs to that section until the next sectionBreak.
            const sections = [];
            let current = null;
            for (const mod of visible) {
              if (mod.sectionBreak || !current) {
                current = { name: mod.sectionBreak || null, mods: [] };
                sections.push(current);
              }
              current.mods.push(mod);
            }
            const activeSection = sections.find(s => s.mods.some(m => m.id === activeModule));
            return sections.map((section, si) => {
              const isCollapsed = section.name && collapsedSections.has(section.name) && section !== activeSection;
              return (
                <div key={si}>
                  {section.name && (
                    <button className="sidebar-section-toggle" onClick={() => toggleSection(section.name)}>
                      <span className={`sidebar-section-chevron${isCollapsed ? "" : " expanded"}`}>▶</span>
                      {section.name}
                    </button>
                  )}
                  {!isCollapsed && section.mods.map(mod => (
                    <button
                      key={mod.id}
                      className={`module-btn ${activeModule === mod.id ? "active" : ""}`}
                      onClick={() => switchModule(mod.id)}
                    >
                      <span className="module-icon">{mod.icon}</span>
                      <span className="module-info">
                        <span className="module-name">{mod.label}</span>
                        <span className="module-desc">{mod.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            });
          })()}

          {/* ── Settings at bottom (always visible — core modules) ── */}
          <div style={{margin:"6px 0",borderTop:"1px solid var(--border)"}}/>
          <div className="sidebar-section-label">Settings</div>
          {["data-manager","facility-settings","metrc"].filter(id => isModuleVisible(MODULES.find(m=>m.id===id), productTier, moduleOverrides)).map(id => {
            const mod = MODULES.find(m => m.id === id);
            if (!mod) return null;
            return (
              <button key={id} className={`module-btn ${activeModule === id ? "active" : ""}`} onClick={() => switchModule(id)}>
                <span className="module-icon">{mod.icon}</span>
                <span className="module-info">
                  <span className="module-name">{mod.label}</span>
                  <span className="module-desc">{mod.description}</span>
                </span>
              </button>
            );
          })}

          <div className="sidebar-footer">
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div className="plan-badge">ResinOps V1</div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <button title="Show setup guide" onClick={()=>{setOnboardStep(0);setShowOnboarding(true);}} style={{background:"none",border:"1px solid var(--border-2)",borderRadius:6,color:"var(--text-3)",fontSize:11,padding:"2px 6px",cursor:"pointer"}}>?</button>
                <span style={{fontSize:9,color:"var(--text-3)",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>Beta</span>
              </div>
            </div>
            <div className="plan-text" style={{marginBottom:6}}>Built by operators. Powered by data.</div>
            <div style={{fontSize:9,color:"var(--text-3)",borderTop:"1px solid var(--border)",paddingTop:6,display:"flex",alignItems:"center",gap:6}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"rgba(100,100,100,0.3)",display:"inline-block",flexShrink:0}}/>
              V2: Cloud · Multi-user · METRC API
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="main">
          <div className="header" style={{padding:"10px 24px",justifyContent:"flex-end"}}>
            <button
              className="theme-toggle-btn"
              onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}
              title={theme==="dark"?"Switch to light mode":"Switch to dark mode"}
            >
              {theme==="dark"?"☀️":"🌙"}
            </button>
            <div className="user-menu-wrap" ref={userMenuRef}>
              <button className="user-menu-btn" onClick={()=>setUserMenuOpen(o=>!o)}>
                <div className="user-avatar-sm">{userEmail?userEmail[0].toUpperCase():"U"}</div>
                <span style={{maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{userEmail||"Account"}</span>
                <span style={{fontSize:10,opacity:0.5}}>{userMenuOpen?"▲":"▼"}</span>
              </button>
              {userMenuOpen&&(
                <div className="user-dropdown">
                  <div className="user-dropdown-header">
                    <strong>{userEmail||"User"}</strong>
                    Signed in
                  </div>
                  <button className="user-dropdown-item" onClick={()=>{setShowAccountSettings(true);setAcctTab("profile");setUserMenuOpen(false);setAcctMsg({text:"",type:""});}}>
                    ⚙️ Account Settings
                  </button>
                  <button className="user-dropdown-item" onClick={()=>{switchModule("facility-settings");setUserMenuOpen(false);}}>
                    🏢 Facility Settings
                  </button>
                  <div className="user-dropdown-divider"/>
                  <button className="user-dropdown-item danger" onClick={handleSignOut}>
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>

          <ErrorBoundary key={activeModule}>
            {activeModule === "ops-analyst" ? <OpsAnalyst /> : null}
            {activeModule === "scheduler" ? <Scheduler /> : null}
            {activeModule === "production" ? <ProductionScheduler /> : null}
            {activeModule === "yield-dashboard" ? <YieldDashboard /> : null}
            {activeModule === "harvest" ? <HarvestBatches /> : null}
            {activeModule === "remediation" ? <Remediation /> : null}
            {activeModule === "grow-map" ? <GrowMap /> : null}
            {activeModule === "clone-scheduler" ? <CloneScheduler /> : null}
            {activeModule === "pheno-hunt" ? <PhenoHunt /> : null}
            {activeModule === "strain-db" ? <StrainDatabase /> : null}
            {activeModule === "mother-plants" ? <MotherPlantManager /> : null}
            {activeModule === "cult-inputs" ? <CultivationInputs /> : null}
            {activeModule === "spray-log" ? <SprayLog /> : null}
            {activeModule === "tc-tracker" ? <TCTracker /> : null}
            {activeModule === "qc-testing" ? <QCTesting /> : null}
            {activeModule === "metrc" ? <MetrcHub /> : null}
            {activeModule === "gmp-hub" ? <GMPHub /> : null}
            {activeModule === "employees" ? <Employees /> : null}
            {activeModule === "batch-dashboard" ? <BatchDashboard /> : null}
            {activeModule === "dashboard" ? <Dashboard key={"dash-"+dashboardVersion} onNavigate={switchModule} /> : null}
            {activeModule === "data-manager" ? <DataManager /> : null}
            {activeModule === "facility-settings" ? <FacilitySettings /> : null}
            {activeModule === "labor-setup" ? <LaborManager /> : null}
            {activeModule === "labor-dash" ? <LaborDashboard /> : null}
            {activeModule === "inventory" ? <InventoryERP /> : null}
            {activeModule === "finance" ? <Finance /> : null}
            {activeModule === "equipment" ? <Equipment /> : null}
            {activeModule === "facility-map" ? <FacilityMap /> : null}
            {activeModule === "maintenance" ? <Maintenance /> : null}
            {activeModule === "ipm-tracker" ? <IPMTracker /> : null}
            {activeModule === "sales" ? <SalesOrders /> : null}
            {activeModule === "customers" ? <Customers /> : null}
          </ErrorBoundary>

          <div className="chat-area" style={{display: (isSchedulerActive && !isAIChat) ? "none" : undefined}}>
            {showWelcome && (
              <div className="welcome">
                <div className="welcome-heading">
                  What's going on in the <span>grow</span>?
                </div>
                <div className="welcome-sub">
                  Ask anything — pest ID, VPD troubleshooting, nutrient lockout, harvest timing, training decisions. This is built for people who work in the room, not around it.
                </div>
                <div className="suggestions-label">Try asking</div>
                <div className="suggestions">
                  {(SUGGESTIONS[activeModule] || []).map((s, i) => (
                    <button key={i} className="suggestion-btn" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.length > 0 && (
              <div className="messages">
                {messages.map((msg, i) => (
                  <div key={i} className={`message ${msg.role === "user" ? "user" : ""}`}>
                    <div className={`avatar ${msg.role === "user" ? "user-av" : "ai"}`}>
                      {msg.role === "user" ? "U" : "RO"}
                    </div>
                    <div className={`bubble ${msg.role === "user" ? "user-bubble" : "ai"}`}>
                      {msg.role === 'assistant'
                        ? renderMarkdown(msg.content)
                        : (<>
                            {msg.preview && <img src={msg.preview} alt="uploaded" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '6px', marginBottom: msg.displayText ? '8px' : '0', display: 'block' }} />}
                            {msg.displayText && <span>{msg.displayText}</span>}
                            {!msg.preview && !msg.displayText && (typeof msg.content === 'string' ? msg.content : '')}
                          </>)
                      }
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="message">
                    <div className="avatar ai">RO</div>
                    <div className="bubble ai">
                      <div className="typing">
                        <span /><span /><span />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {(!isSchedulerActive || isAIChat) && <div className="input-area">
            {image && (
              <div className="image-preview-bar">
                <div className="image-preview-wrap">
                  <img src={image.preview} alt="preview" className="image-thumb" />
                  <button className="image-remove" onClick={removeImage}>×</button>
                </div>
                <span className="image-preview-label">Image attached — add a question below or send as-is</span>
              </div>
            )}
            <div className="input-wrap">
              <input ref={fileInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImageSelect} />
              <button className="attach-btn" onClick={() => fileInputRef.current?.click()} disabled={loading} title="Attach image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <div className="textarea-wrap">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); autoResize(e); }}
                  onKeyDown={handleKey}
                  placeholder={image ? "Ask about this image…" : `Ask the ${currentModule?.label} module anything…`}
                  rows={1}
                />
              </div>
              <button className="send-btn" onClick={() => send()} disabled={(!input.trim() && !image) || loading}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <div className="input-meta">
              <span className="input-hint">Enter to send · Shift+Enter for new line</span>
              {messages.length > 0 && (
                <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                  <button className="clear-btn" onClick={exportChat} title="Download as HTML — open in Word or print to PDF">
                    ↓ Save chat
                  </button>
                  <button className="clear-btn" onClick={() => { setMessages([]); setImage(null); }}>Clear conversation</button>
                </div>
              )}
            </div>
          </div>}
        </main>
      </div>
      {/* Account Settings Modal */}
      {showAccountSettings && (
        <div className="acct-overlay" onClick={(e)=>{if(e.target===e.currentTarget)setShowAccountSettings(false);}}>
          <div className="acct-modal">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <div className="acct-title">Account Settings</div>
                <div className="acct-sub">{userEmail}</div>
              </div>
              <button onClick={()=>setShowAccountSettings(false)} style={{background:"none",border:"none",color:"var(--text-3)",fontSize:20,cursor:"pointer",padding:4}}>✕</button>
            </div>

            <div style={{display:"flex",gap:8,marginBottom:20}}>
              <button className={`acct-btn ${acctTab==="profile"?"primary":"secondary"}`} onClick={()=>{setAcctTab("profile");setAcctMsg({text:"",type:""});}}>Email</button>
              <button className={`acct-btn ${acctTab==="password"?"primary":"secondary"}`} onClick={()=>{setAcctTab("password");setAcctMsg({text:"",type:""});}}>Password</button>
            </div>

            {acctTab==="profile" && (
              <>
                <div className="acct-field">
                  <label className="acct-lbl">Current Email</label>
                  <input className="acct-inp" value={userEmail} disabled style={{opacity:0.6}} />
                </div>
                <div className="acct-field">
                  <label className="acct-lbl">New Email</label>
                  <input className="acct-inp" type="email" value={acctNewEmail} onChange={e=>setAcctNewEmail(e.target.value)} placeholder="new@example.com" />
                </div>
                <button className="acct-btn primary" onClick={handleUpdateEmail} disabled={acctLoading}>
                  {acctLoading?"Updating...":"Update Email"}
                </button>
              </>
            )}

            {acctTab==="password" && (
              <>
                <div className="acct-field">
                  <label className="acct-lbl">Current Password</label>
                  <input className="acct-inp" type="password" value={acctCurrentPw} onChange={e=>setAcctCurrentPw(e.target.value)} autoComplete="current-password" />
                </div>
                <div className="acct-field">
                  <label className="acct-lbl">New Password</label>
                  <input className="acct-inp" type="password" value={acctNewPw} onChange={e=>setAcctNewPw(e.target.value)} placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`} autoComplete="new-password" />
                </div>
                <div className="acct-field">
                  <label className="acct-lbl">Confirm New Password</label>
                  <input className="acct-inp" type="password" value={acctConfirmPw} onChange={e=>setAcctConfirmPw(e.target.value)} placeholder="Re-enter new password" />
                </div>
                <button className="acct-btn primary" onClick={handleChangePassword} disabled={acctLoading}>
                  {acctLoading?"Updating...":"Change Password"}
                </button>
              </>
            )}

            {acctMsg.text && <div className={`acct-msg ${acctMsg.type}`}>{acctMsg.text}</div>}
          </div>
        </div>
      )}
    </>
  );
}
