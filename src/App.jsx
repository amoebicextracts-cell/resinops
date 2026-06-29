import { useState, useRef, useEffect } from "react";
import Scheduler from "./Scheduler.jsx";

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

// ── Module Config ─────────────────────────────────────────────────────────────
const MODULES = [
  {
    id: "cultivation",
    label: "Cultivation",
    icon: "🌿",
    available: true,
    description: "Environment, IPM, nutrients, training, harvest timing",
  },
  {
    id: "post-harvest",
    label: "Post-Harvest",
    icon: "✂️",
    available: true,
    description: "Drying, curing, trimming, storage",
  },
  {
    id: "extraction",
    label: "Extraction",
    icon: "⚗️",
    available: true,
    description: "Solventless, hydrocarbon, CO2, distillate",
  },
  {
    id: "compliance",
    label: "Compliance & QC",
    icon: "📋",
    available: false,
    description: "Metrc, testing, contamination response",
  },
  {
    id: "facility",
    label: "Facility & Infra",
    icon: "🏗️",
    available: true,
    description: "HVAC, electrical, dehumidification, water",
  },
  {
    id: "scheduler",
    label: "Grow Scheduler",
    icon: "📅",
    available: true,
    description: "Plan timelines from clone cut to inventory",
    isScheduler: true,
  },
];

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
  @media (max-width: 640px) {
    .sidebar { display: none; }
    .chat-area { padding: 16px; }
    .input-area { padding: 12px 16px 16px; }
  }
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
        items.push(<li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(lines[i].slice(2)) }} />);
        i++;
      }
      result.push(<ul key={`ul-${i}`}>{items}</ul>);
      continue;
    } else if (line.match(/^\d+\. /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(<li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(lines[i].replace(/^\d+\. /, "")) }} />);
        i++;
      }
      result.push(<ol key={`ol-${i}`}>{items}</ol>);
      continue;
    } else if (line.trim() !== "") {
      result.push(<p key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />);
    }
    i++;
  }
  return result;
}

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ResinOps() {
  const [activeModule, setActiveModule] = useState("cultivation");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: activeModule, messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');
      const reply = data.content?.map((b) => b.text || '').join('') || 'Something went wrong. Please try again.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error. Check your network and try again.' }]);
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

  const switchModule = (id) => {
    const mod = MODULES.find((m) => m.id === id);
    if (!mod?.available) return;
    setActiveModule(id);
    setMessages([]);
    setImage(null);
  };

  const isSchedulerActive = activeModule === "scheduler";

  const showWelcome = messages.length === 0;

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-mark">ResinOps</div>
            <div className="logo-sub">Cannabis Operations AI</div>
          </div>

          <div className="sidebar-section-label">Modules</div>

          {MODULES.filter(m => !m.isScheduler).map((mod) => (
            <button
              key={mod.id}
              className={`module-btn ${activeModule === mod.id ? "active" : ""} ${!mod.available ? "locked" : ""}`}
              onClick={() => switchModule(mod.id)}
            >
              <span className="module-icon">{mod.icon}</span>
              <span className="module-info">
                <span className="module-name">
                  {mod.label}
                  {!mod.available && <span className="badge-soon">Soon</span>}
                </span>
                <span className="module-desc">{mod.description}</span>
              </span>
            </button>
          ))}

          <div style={{margin:"8px 0",borderTop:"1px solid var(--border)"}}/>
          <div className="sidebar-section-label">Tools</div>

          {MODULES.filter(m => m.isScheduler).map((mod) => (
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

          <div className="sidebar-footer">
            <div className="plan-badge">Beta</div>
            <div className="plan-text">Compliance module coming in v2.</div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="main">
          <div className="header">
            <span className="header-icon">{currentModule?.icon}</span>
            <div>
              <div className="header-title">{currentModule?.label}</div>
              <div className="header-desc">{currentModule?.description}</div>
            </div>
            <div className="header-status">
              <div className="status-dot" />
              Live
            </div>
          </div>

          {isSchedulerActive ? (
            <Scheduler />
          ) : null}

          <div className="chat-area" style={{display: isSchedulerActive ? "none" : undefined}}>
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

          {!isSchedulerActive && <div className="input-area">
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
          </div>
        </main>
      </div>
    </>
  );
}
