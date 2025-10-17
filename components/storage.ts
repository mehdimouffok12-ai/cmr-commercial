// components/storage.ts

// ---------- Types ----------
export type Prospect = {
  id: string;
  client: string;
  marche: string;
  produit: string;
  dContact: string;
  offre: 'Oui'|'Non';
  dOffre?: string;
  montant?: number|null;
  statut: 'À qualifier'|'Offre envoyée'|'En négociation'|'Perdu'|'Signé';
  relance?: string;
  reponse: 'Oui'|'Non';
  dReponse?: string;
  cause?: string;
  fournisseur?: string;
  dSignature?: string;
  note?: string;
};

export type Offre = {
  id: string;
  prospectId?: string;
  client: string;
  marche: string;
  produit: string;
  calibre?: string;
  incoterm: 'FOB'|'CFR'|'CIF'|'EXW';
  prix_usd_kg: number;
  volume_kg: number;
  date_offre: string;
  validite_jours?: number;
  statut_offre: 'Envoyée'|'En négociation'|'Acceptée'|'Refusée';
  // simulateur marge (facultatif)
  prix_achat_usd_kg?: number;
  fret_usd_kg?: number;
  autres_frais_usd_kg?: number;
  note?: string;
};

export type Refs = {
  clients: string[];
  produits: string[];
  // Benchmarks marché manuels (optionnel)
  benchmarks?: Array<{
    produit: string; marche: string; incoterm: 'FOB'|'CFR'|'CIF'|'EXW';
    mois: string; // AAAA-MM
    prix_ref_usd_kg: number;
  }>;
};

export type FxCache = {
  ts: number; // timestamp ms
  usd_eur: number;
};

const LS_KEYS = {
  prospects: 'cmr_prospects',
  offres: 'cmr_offres',
  refs: 'cmr_refs',
  fx: 'cmr_fx'
};

// ---------- Prospects ----------
export function loadProspects(): Prospect[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(LS_KEYS.prospects);
  return raw ? JSON.parse(raw) : [];
}
export function saveProspects(rows: Prospect[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEYS.prospects, JSON.stringify(rows));
}

// ---------- Offres ----------
export function loadOffres(): Offre[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(LS_KEYS.offres);
  return raw ? JSON.parse(raw) : [];
}
export function saveOffres(rows: Offre[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEYS.offres, JSON.stringify(rows));
}

// ---------- Référentiels ----------
const DEFAULT_PRODUITS = [
  'Crevette Vannamei (Équateur)',
  'Crevette Muelleri (Argentine)',
  'Corvina (Amérique du Sud)',
  'Merlu Hubbsi (Argentine)',
  'Jack Mackerel (CL/PE)'
];

export function loadRefs(): Refs {
  if (typeof window === 'undefined') return { clients: [], produits: DEFAULT_PRODUITS, benchmarks: [] };
  const raw = localStorage.getItem(LS_KEYS.refs);
  if (!raw) {
    const seed: Refs = { clients: [], produits: DEFAULT_PRODUITS, benchmarks: [] };
    localStorage.setItem(LS_KEYS.refs, JSON.stringify(seed));
    return seed;
  }
  const parsed = JSON.parse(raw) as Refs;
  if (!parsed.produits || parsed.produits.length === 0) parsed.produits = DEFAULT_PRODUITS;
  if (!parsed.benchmarks) parsed.benchmarks = [];
  return parsed;
}
export function saveRefs(refs: Refs) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEYS.refs, JSON.stringify(refs));
}
export function upsertClient(name: string) {
  if (!name) return;
  const r = loadRefs();
  if (!r.clients.map(x=>x.toLowerCase()).includes(name.toLowerCase())) {
    r.clients = [name, ...r.clients];
    saveRefs(r);
  }
}
export function upsertProduit(name: string) {
  if (!name) return;
  const r = loadRefs();
  if (!r.produits.map(x=>x.toLowerCase()).includes(name.toLowerCase())) {
    r.produits = [name, ...r.produits];
    saveRefs(r);
  }
}

// ---------- FX ----------
export async function getUsdEur(): Promise<number> {
  if (typeof window === 'undefined') return 0.92; // fallback
  const raw = localStorage.getItem(LS_KEYS.fx);
  const now = Date.now();
  if (raw) {
    const cache = JSON.parse(raw) as FxCache;
    if (now - cache.ts < 24*3600*1000) return cache.usd_eur;
  }
  try {
    // API publique gratuite (sans clé) — mise en cache 24h
    const res = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=EUR', { cache: 'no-store' });
    const j = await res.json();
    const rate = j?.rates?.EUR ?? 0.92;
    localStorage.setItem(LS_KEYS.fx, JSON.stringify({ ts: now, usd_eur: rate }));
    return rate;
  } catch {
    return 0.92;
  }
}

// ---------- Utils ----------
export function resetAll() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LS_KEYS.prospects);
  localStorage.removeItem(LS_KEYS.offres);
  localStorage.removeItem(LS_KEYS.refs);
  localStorage.removeItem(LS_KEYS.fx);
}
export function nextId(prefix: string, existing: {id:string}[]) {
  const max = existing.reduce((m, r) => Math.max(m, parseInt((r.id.split('-')[1]||'0'), 10)), 0);
  return `${prefix}-${String(max+1).padStart(6,'0')}`;
}

// ---------- Aide calculs ----------
export function addDays(dateISO: string, n: number) {
  const d = new Date(dateISO); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10);
}
export function monthStr(dateISO: string) {
  const d = new Date(dateISO); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
