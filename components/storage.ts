// components/storage.ts

export type Prospect = {
  id: string; client: string; marche: string; produit: string;
  dContact: string; offre: 'Oui'|'Non'; dOffre?: string; montant?: number|null;
  statut: 'À qualifier'|'Offre envoyée'|'En négociation'|'Perdu'|'Signé';
  relance?: string; reponse: 'Oui'|'Non'; dReponse?: string; cause?: string;
  fournisseur?: string; dSignature?: string; note?: string;
};

export type Interaction = {
  id: string; prospectId: string; date: string; canal: string; type: string;
  resume?: string; next?: string; nextDate?: string;
};

export type Offre = {
  id: string; prospectId?: string; client: string; marche: string;
  produit: string; calibre?: string; incoterm: 'FOB'|'CFR'|'CIF'|'EXW';
  prix_usd_kg: number; volume_kg: number;
  date_offre: string; validite_jours?: number;
  statut_offre: 'Envoyée'|'En négociation'|'Acceptée'|'Refusée';
  note?: string;
};

// ---- Référentiels (Clients / Produits) ----
export type Refs = {
  clients: string[];
  produits: string[];
};

const LS_KEYS = {
  prospects: 'cmr_prospects',
  interactions: 'cmr_interactions',
  offres: 'cmr_offres',
  refs: 'cmr_refs'
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

// ---------- Interactions ----------
export function loadInteractions(): Interaction[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(LS_KEYS.interactions);
  return raw ? JSON.parse(raw) : [];
}
export function saveInteractions(rows: Interaction[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEYS.interactions, JSON.stringify(rows));
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
  if (typeof window === 'undefined') return { clients: [], produits: DEFAULT_PRODUITS };
  const raw = localStorage.getItem(LS_KEYS.refs);
  if (!raw) {
    const seed = { clients: [], produits: DEFAULT_PRODUITS };
    localStorage.setItem(LS_KEYS.refs, JSON.stringify(seed));
    return seed;
  }
  const parsed = JSON.parse(raw) as Refs;
  // sécurité : si produits vide, réensemencer
  if (!parsed.produits || parsed.produits.length === 0) parsed.produits = DEFAULT_PRODUITS;
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

// ---------- Utilities ----------
export function resetAll() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LS_KEYS.prospects);
  localStorage.removeItem(LS_KEYS.interactions);
  localStorage.removeItem(LS_KEYS.offres);
  localStorage.removeItem(LS_KEYS.refs);
}
export function nextId(prefix: string, existing: {id:string}[]) {
  const max = existing.reduce((m, r) => Math.max(m, parseInt((r.id.split('-')[1]||'0'), 10)), 0);
  return `${prefix}-${String(max+1).padStart(6,'0')}`;
}
