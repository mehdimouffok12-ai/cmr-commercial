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

const LS_KEYS = { prospects: 'cmr_prospects', interactions: 'cmr_interactions' };

export function loadProspects(): Prospect[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(LS_KEYS.prospects);
  return raw ? JSON.parse(raw) : [];
}
export function saveProspects(rows: Prospect[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEYS.prospects, JSON.stringify(rows));
}
export function loadInteractions(): Interaction[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(LS_KEYS.interactions);
  return raw ? JSON.parse(raw) : [];
}
export function saveInteractions(rows: Interaction[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEYS.interactions, JSON.stringify(rows));
}
