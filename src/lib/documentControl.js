// ============================================================
// Document Control helpers (pure, unit-tested in test/document-control.test.js)
// ============================================================

export const DOC_CATEGORIES = [
  { v: 'template', l: 'Templates' },
  { v: 'batch_record', l: 'Production batch records' },
  { v: 'rd_record', l: 'R&D records' },
  { v: 'sop', l: 'SOPs' },
  { v: 'form', l: 'Forms' },
  { v: 'other', l: 'Other' },
];
export const CATEGORY_LABEL = Object.fromEntries(DOC_CATEGORIES.map(c => [c.v, c.l]));

export const PRODUCT_TYPES = ['Pre-roll', 'Infused pre-roll', 'Vape', 'Gummy', 'Chocolate', 'Flower', 'Concentrate', 'Other'];

function parts(label) {
  return String(label || '').split('.').map(n => parseInt(n, 10) || 0);
}

/** Compare version labels numerically: 1.10 > 1.9, 2 > 1.9. */
export function compareVersionLabels(a, b) {
  const pa = parts(a), pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Next label after the highest existing one: minor bumps 1.2 -> 1.3, major bumps 1.2 -> 2.0. */
export function nextVersionLabel(labels, kind = 'minor') {
  const list = (labels || []).filter(Boolean);
  if (!list.length) return '1.0';
  const top = [...list].sort(compareVersionLabels).pop();
  const [major = 1, minor = 0] = parts(top);
  return kind === 'major' ? `${major + 1}.0` : `${major}.${minor + 1}`;
}

/** Newest first; pending uploads are excluded (they aren't documents yet). */
export function visibleVersions(versions, documentId) {
  return (versions || [])
    .filter(v => v.document_id === documentId && v.status !== 'pending')
    .sort((a, b) => compareVersionLabels(b.version_label, a.version_label));
}

/** Documents with their current version and version count, filtered and grouped by category. */
export function groupDocuments(documents, versions, { search = '', category = '', showRetired = false } = {}) {
  const q = search.trim().toLowerCase();
  const rows = (documents || [])
    .filter(d => showRetired || d.status !== 'retired')
    .filter(d => !category || d.category === category)
    .filter(d => !q || [d.title, d.doc_key, d.product_type, d.notes].some(s => String(s || '').toLowerCase().includes(q)))
    .map(d => {
      const vs = visibleVersions(versions, d.id);
      return { ...d, versions: vs, current: vs.find(v => v.status === 'current') || null };
    })
    .sort((a, b) => String(b.current?.created_at || b.created_at || '').localeCompare(String(a.current?.created_at || a.created_at || '')));
  return DOC_CATEGORIES
    .map(c => ({ category: c.v, label: c.l, docs: rows.filter(r => r.category === c.v) }))
    .filter(g => g.docs.length);
}

export function fmtBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
