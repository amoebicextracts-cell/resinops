// ============================================================
// ResinOps — Large-tap-target numeric entry for gloved/shop-floor use
// src/NumpadInput.jsx
//
// Item 6 of the TSW KPI Cost Tracker competitive-feature-adoption
// list ("numpad/gloved-hands UX"). A drop-in replacement for a plain
// <input type="number"> anywhere entry happens standing at a scale
// rather than sitting at a desk -- small native number-input spinners
// and the OS's own on-screen keyboard are both hard to hit precisely
// with gloves on or through a tablet screen protector. Renders a
// large read-only display (inputMode="none" suppresses the OS
// keyboard) plus its own large-button digit pad.
// ============================================================

const CSS = `
  .npd-display{width:100%;background:var(--surface-2);border:1px solid var(--border-2);border-radius:8px;color:var(--text);font-family:'Inter',sans-serif;font-size:22px;font-weight:600;padding:14px 16px;box-sizing:border-box;text-align:right;}
  .npd-display:focus{outline:none;border-color:var(--accent);}
  .npd-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;}
  .npd-key{border:1px solid var(--border-2);border-radius:8px;background:var(--surface-2);color:var(--text);font-family:'Inter',sans-serif;font-size:20px;font-weight:600;padding:16px 0;cursor:pointer;user-select:none;}
  .npd-key:active{background:var(--accent);color:#fff;}
  .npd-key.npd-del{background:rgba(200,74,74,0.1);color:var(--danger);border-color:rgba(200,74,74,0.3);}
`;

// value/onChange follow the same contract as a plain <input> everywhere
// else in the app: value is the current string, onChange receives the
// new string directly (not a synthetic event -- there's no native
// text input being typed into here).
export default function NumpadInput({ value, onChange, placeholder, unit, allowDecimal = true }) {
  function press(key) {
    const v = value || "";
    if (key === "back") { onChange(v.slice(0, -1)); return; }
    if (key === ".") { if (!allowDecimal || v.includes(".")) return; onChange(v + "."); return; }
    onChange(v + key);
  }
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", allowDecimal ? "." : "", "0", "back"];
  return (
    <>
      <style>{CSS}</style>
      <input
        className="npd-display"
        readOnly
        inputMode="none"
        value={value ? value + (unit ? ` ${unit}` : "") : ""}
        placeholder={placeholder}
      />
      <div className="npd-grid">
        {keys.map((k, i) => k === "" ? <div key={i} /> : (
          <button key={i} type="button" className={"npd-key" + (k === "back" ? " npd-del" : "")} onClick={() => press(k)}>
            {k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>
    </>
  );
}
