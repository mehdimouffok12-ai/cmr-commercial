'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Prospect, Offre, Refs,
  loadProspects, saveProspects,
  loadOffres, saveOffres,
  loadRefs, saveRefs, upsertClient, upsertProduit,
  getUsdEur, resetAll, nextId, addDays
} from '../components/storage';

/* ===========================
   Utilitaires
=========================== */
const marches = ['Maroc', 'GCC', 'Afrique de l’Ouest', 'Autres'] as const;
const statutsProspect = ['À qualifier','Offre envoyée','En négociation','Perdu','Signé'] as const;
const ouiNon = ['Oui','Non'] as const;
const causes = ['Prix','Disponibilité','Délai','Qualité','Conditions','Autre'] as const;
const statutsOffre = ['Envoyée','En négociation','Acceptée','Refusée'] as const;

function todayStr(){ return new Date().toISOString().slice(0,10); }
function diffDays(aISO?: string, bISO?: string){ if(!aISO||!bISO) return null; return Math.round((new Date(aISO).getTime()-new Date(bISO).getTime())/86400000); }
function median(nums: number[]){ if(nums.length===0) return null; const s=[...nums].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2; }
function isExpiring(o:Offre){ if(!o.validite_jours) return false; const exp = addDays(o.date_offre, o.validite_jours); const d = diffDays(exp, todayStr()); return d!==null && d<=3; }
function clamp(n:number,min:number,max:number){ return Math.max(min,Math.min(max,n)); }

/* ===========================
   Scoring / Suggestions
=========================== */
function scoreProspect(p: Prospect, offres: Offre[]) {
  const last = p.relance || p.dContact;
  const d = last ? Math.max(0, diffDays(todayStr(), last) || 0) : 999;
  const recence = Math.max(0, 100 - Math.min(100, d*5));
  const inter30 = offres.filter(o => o.client.toLowerCase()===p.client.toLowerCase() && (diffDays(todayStr(), o.date_offre) as number) <= 30).length;
  const freq = Math.min(100, inter30*25);
  const pot = offres.filter(o => o.client.toLowerCase()===p.client.toLowerCase() && ['Envoyée','En négociation'].includes(o.statut_offre||'')).reduce((s,o)=> s + (o.prix_usd_kg*o.volume_kg),0);
  const potScaled = Math.min(100, Math.log10(1 + pot/1000)*40);
  const statutW = { 'Signé':100, 'En négociation':70, 'Offre envoyée':40, 'À qualifier':20, 'Perdu':0 } as const;
  const score = Math.round(0.30*recence + 0.20*freq + 0.30*potScaled + 0.20*(statutW[p.statut]??0));
  const grade = score>=75?'A':score>=60?'B':score>=40?'C':'D';
  const nba = grade==='A'?'Relancer aujourd’hui (prix/marge)':grade==='B'?'Demander feedback précis':'Envoyer info marché + alternative';
  return {score, grade, nba};
}
function suggestPrice(offres: Offre[], p:{produit:string; marche:string; incoterm:Offre['incoterm']; calibre?:string}){
  const now = Date.now(), win = 30*86400000;
  const arr = offres.filter(o=>{
    const okTime = now - new Date(o.date_offre).getTime() <= win;
    const ok = o.produit===p.produit && o.marche===p.marche && o.incoterm===p.incoterm;
    const okCal = p.calibre ? (o.calibre||'')===p.calibre : true;
    return okTime && ok && okCal;
  }).map(o=>o.prix_usd_kg);
  if(!arr.length) return null;
  return { mediane: median(arr)!, min: Math.min(...arr), max: Math.max(...arr) };
}

/* ===========================
   Composant principal
=========================== */
export default function Page(){
  const [tab,setTab] = useState<'dashboard'|'prospects'|'offres'|'referentiels'|'saisonnier'>('dashboard');

  const [prospects,setProspects]=useState<Prospect[]>([]);
  const [offres,setOffres]=useState<Offre[]>([]);
  const [refs,setRefs]=useState<Refs>({clients:[],produits:[],benchmarks:[]});
  const [usdEur,setUsdEur]=useState<number>(0.92);

  useEffect(()=>{ setProspects(loadProspects()); setOffres(loadOffres()); setRefs(loadRefs()); },[]);
  useEffect(()=>{ saveProspects(prospects); },[prospects]);
  useEffect(()=>{ saveOffres(offres); },[offres]);
  useEffect(()=>{ saveRefs(refs); },[refs]);
  useEffect(()=>{ getUsdEur().then(setUsdEur); },[]);

  /* ----- Formulaires ----- */
  const [pForm,setPForm]=useState<Prospect>({
    id:'', client:'', marche:'Maroc', produit:'', dContact: todayStr(),
    offre:'Non', dOffre:'', montant: undefined, statut:'À qualifier',
    relance:'', reponse:'Non', dReponse:'', cause:'', fournisseur:'', dSignature:'', note:''
  });
  useEffect(()=>{ setPForm(prev=>({...prev, produit: prev.produit || (refs.produits[0]||'')})); },[refs]);

  const [oForm,setOForm]=useState<Offre>({
    id:'', client:'', marche:'Maroc', produit:'', calibre:'', incoterm:'CFR',
    prix_usd_kg:0, volume_kg:0, date_offre: todayStr(), validite_jours:15, statut_offre:'Envoyée',
    prix_achat_usd_kg: undefined, fret_usd_kg: undefined, autres_frais_usd_kg: undefined, note:'', prospectId: undefined
  });
  useEffect(()=>{ setOForm(prev=>({...prev, produit: prev.produit || (refs.produits[0]||'')})); },[refs]);

  /* ----- KPIs ----- */
  const offresEnv = prospects.filter(p=>p.offre==='Oui').length;
  const reps = prospects.filter(p=>p.reponse==='Oui').length;
  const signes = prospects.filter(p=>p.statut==='Signé').length;
  const tauxReponse = offresEnv? (reps/offresEnv):0;
  const tauxConv = offresEnv? (signes/offresEnv):0;

  /* ----- Relances / Expirations ----- */
  const ajd = todayStr();
  const relancesDuJour = useMemo(()=> prospects.filter(p=> p.relance && p.relance<=ajd && !['Signé','Perdu'].includes(p.statut)),[prospects]);
  const offresQuiExpirent = offres.filter(isExpiring);

  /* ----- Scoring enrichi ----- */
  const scored = useMemo(()=> prospects.map(p=>{
    const s = scoreProspect(p, offres);
    return {...p, _score:s.score, _grade:s.grade, _nba:s.nba} as any;
  }),[prospects,offres]);

  /* ----- Suggestion prix ----- */
  const suggestion = useMemo(()=> oForm.produit && oForm.marche && oForm.incoterm
    ? suggestPrice(offres,{produit:oForm.produit,marche:oForm.marche,incoterm:oForm.incoterm,calibre:oForm.calibre})
    : null
  ,[oForm,offres]);

  /* ----- Liaisons Référentiels (auto-ajout si saisie libre) ----- */
  function ensureClientInRefs(name:string){
    const n = name.trim(); if(!n) return;
    if(!refs.clients.some(c=>c.toLowerCase()===n.toLowerCase())){ upsertClient(n); setRefs(loadRefs()); }
  }
  function ensureProduitInRefs(name:string){
    const n = name.trim(); if(!n) return;
    if(!refs.produits.some(c=>c.toLowerCase()===n.toLowerCase())){ upsertProduit(n); setRefs(loadRefs()); }
  }

  /* ----- Actions ----- */
  function addProspect(){
    if(!pForm.client.trim()) return alert('Client / Prospect obligatoire');
    if(!pForm.produit) return alert('Produit obligatoire');
    if(pForm.offre==='Oui' && !pForm.dOffre) return alert("Date d'offre requise");
    if(pForm.reponse==='Oui' && !pForm.dReponse) return alert("Date de réponse requise");
    if(pForm.statut==='Signé' && !pForm.dSignature) return alert("Date de signature requise");

    ensureClientInRefs(pForm.client);
    ensureProduitInRefs(pForm.produit);

    const rec: Prospect = { ...pForm, id: nextId('PR', prospects), montant: pForm.montant ?? null };
    setProspects([rec, ...prospects]);

    setPForm({...pForm, id:'', client:'', produit: refs.produits[0]||'', dContact: todayStr(), offre:'Non', dOffre:'', montant: undefined, statut:'À qualifier', relance:'', reponse:'Non', dReponse:'', cause:'', fournisseur:'', dSignature:'', note:''});
  }

  function addOffre(){
    if(!oForm.client.trim()) return alert('Client / Prospect obligatoire');
    if(!oForm.produit) return alert('Produit obligatoire');
    if(!oForm.prix_usd_kg || oForm.prix_usd_kg<=0) return alert('Prix USD/kg requis (>0)');
    if(!oForm.volume_kg || oForm.volume_kg<=0) return alert('Volume (kg) requis (>0)');

    ensureClientInRefs(oForm.client);
    ensureProduitInRefs(oForm.produit);

    if (suggestion?.mediane){
      const delta = Math.abs(oForm.prix_usd_kg - suggestion.mediane)/suggestion.mediane;
      if (delta>0.03 && !confirm(`⚠️ Prix s’écarte de ${(delta*100).toFixed(1)}% de la médiane (${suggestion.mediane.toFixed(2)} USD/kg). Continuer ?`)) return;
    }

    let prospectId = oForm.prospectId;
    if (!prospectId){
      const last = [...prospects].filter(p=>p.client.toLowerCase()===oForm.client.toLowerCase()).sort((a,b)=> (b.dContact||'').localeCompare(a.dContact||''))[0];
      prospectId = last?.id;
    }

    const rec: Offre = { ...oForm, id: nextId('OF', offres), prospectId };
    setOffres([rec, ...offres]);

    if (prospectId){
      setProspects(prev => prev.map(p => p.id===prospectId ? {...p, offre:'Oui', dOffre:oForm.date_offre, statut: p.statut==='À qualifier'?'Offre envoyée':p.statut } : p));
    }

    setOForm({ id:'', client:'', marche:'Maroc', produit: refs.produits[0]||'', calibre:'', incoterm:'CFR', prix_usd_kg:0, volume_kg:0, date_offre: todayStr(), validite_jours:15, statut_offre:'Envoyée', prix_achat_usd_kg: undefined, fret_usd_kg: undefined, autres_frais_usd_kg: undefined, note:'', prospectId: undefined });
  }

  function updateProspectInline(id:string, patch: Partial<Prospect>){
    setProspects(prev => prev.map(p => p.id===id ? {...p, ...patch} : p));
  }
  function updateOffreInline(id:string, patch: Partial<Offre>){
    setOffres(prev => prev.map(o => o.id===id ? {...o, ...patch} : o));
    if (patch.statut_offre){
      const off = offres.find(o=>o.id===id);
      if (off?.prospectId){
        setProspects(prev => prev.map(p=>{
          if (p.id!==off.prospectId) return p;
          let s = p.statut;
          if (patch.statut_offre==='Acceptée') s='Signé';
          else if (patch.statut_offre==='En négociation') s='En négociation';
          else if (patch.statut_offre==='Envoyée' && p.statut==='À qualifier') s='Offre envoyée';
          return {...p, statut:s};
        }));
      }
    }
  }
  function resetData(){ if(confirm('Réinitialiser toutes les données ?')){ resetAll(); location.reload(); } }

  /* ----- Export Excel ----- */
  function exportExcel(){
    const wsPros = XLSX.utils.json_to_sheet(prospects.map(p=>({
      ID:p.id, Client:p.client, Marché:p.marche, Produit:p.produit, 'Date 1er contact':p.dContact,
      'Offre envoyée':p.offre, 'Date offre':p.dOffre||'', 'Montant USD':p.montant??'',
      Statut:p.statut, 'Prochaine relance':p.relance||'', 'Réponse client':p.reponse, 'Date réponse':p.dReponse||'',
      'Cause de perte':p.cause||'', Fournisseur:p.fournisseur||'', 'Date signature':p.dSignature||'', Commentaire:p.note||''
    })));
    const wsOff = XLSX.utils.json_to_sheet(offres.map(o=>({
      ID:o.id, Prospect:o.prospectId||'', Client:o.client, Marché:o.marche, Produit:o.produit, Calibre:o.calibre||'',
      Incoterm:o.incoterm, 'Prix USD/kg':o.prix_usd_kg, 'Volume (kg)':o.volume_kg, Date:o.date_offre, Validité:o.validite_jours??'',
      Statut:o.statut_offre, 'Prix achat USD/kg':o.prix_achat_usd_kg??'', 'Fret USD/kg':o.fret_usd_kg??'', 'Autres frais USD/kg':o.autres_frais_usd_kg??'', Note:o.note||''
    })));
    const wsRefs = XLSX.utils.json_to_sheet([
      ...refs.clients.map(c=>({Type:'Client',Valeur:c})),
      ...refs.produits.map(p=>({Type:'Produit',Valeur:p}))
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsPros, 'Prospects');
    XLSX.utils.book_append_sheet(wb, wsOff, 'Offres');
    XLSX.utils.book_append_sheet(wb, wsRefs, 'Référentiels');
    XLSX.writeFile(wb, `cmr_export_${todayStr()}.xlsx`);
  }

  /* ===========================
     Données Graphiques (Dashboard)
=========================== */
  // Opérations signées = offres Acceptées (plus fiable pour marge)
  const offresAcceptees = useMemo(()=> offres.filter(o=>o.statut_offre==='Acceptée'),[offres]);

  // Camembert marchés (répartition des acceptées par marché)
  const pieMarkets = useMemo(()=>{
    const map: Record<string, number> = {};
    for (const o of offresAcceptees){ map[o.marche] = (map[o.marche]||0) + 1; }
    const arr = Object.entries(map).map(([label,value])=>({label,value}));
    const total = arr.reduce((s,a)=>s+a.value,0) || 1;
    return { data: arr, total };
  },[offresAcceptees]);

  // Histogramme par client : nb opérations + marge moyenne USD/kg
  const barClients = useMemo(()=>{
    const rec: Record<string, {count:number; avgMargin:number}> = {};
    for (const o of offresAcceptees){
      const cost = (o.prix_achat_usd_kg||0)+(o.fret_usd_kg||0)+(o.autres_frais_usd_kg||0);
      const marginKg = o.prix_usd_kg - cost;
      const key = o.client;
      if(!rec[key]) rec[key]={count:0, avgMargin:0};
      const r=rec[key];
      // moyenne incrémentale
      r.avgMargin = (r.avgMargin*r.count + marginKg)/(r.count+1);
      r.count += 1;
    }
    const arr = Object.entries(rec).map(([client,v])=>({client, ...v}));
    arr.sort((a,b)=> b.count-a.count);
    return arr.slice(0,12); // top 12
  },[offresAcceptees]);

  /* ===========================
     Rendu
=========================== */
  const produitsList = refs.produits.length? refs.produits : ['Crevette Vannamei (Équateur)'];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold">CMR Commercial – Eurotrade</h1>
        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-2 rounded-lg bg-blue-600 text-white" onClick={()=>setTab('prospects')}>+ Prospect</button>
          <button className="px-3 py-2 rounded-lg bg-blue-600 text-white" onClick={()=>setTab('offres')}>+ Offre</button>
          <button className="px-3 py-2 rounded-lg border" onClick={exportExcel}>Exporter Excel</button>
          <button className="px-3 py-2 rounded-lg border border-red-300 text-red-600" onClick={resetData}>Réinitialiser</button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-2">
        {(['dashboard','prospects','offres','referentiels','saisonnier'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 rounded-lg border ${tab===t?'bg-blue-600 text-white border-blue-600':'bg-white'}`}>
            {t==='dashboard'?'Dashboard':t==='prospects'?'Prospects':t==='offres'?'Offres (USD/kg)':t==='referentiels'?'Référentiels':'Saisonnier'}
          </button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab==='dashboard' && (
        <div className="space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi title="Taux de réponse" value={`${(tauxReponse*100).toFixed(0)}%`} />
            <Kpi title="Taux de conversion" value={`${(tauxConv*100).toFixed(0)}%`} />
            <Kpi title="Prospects actifs" value={String(prospects.length)} />
            <Kpi title="USD → EUR" value={String(usdEur)} />
          </div>

          {/* Graphiques */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border">
              <div className="px-4 py-3 border-b font-medium">Opérations signées par marché (camembert)</div>
              <div className="p-4">
                {pieMarkets.data.length===0
                  ? <div className="text-sm text-gray-500">Aucune offre acceptée.</div>
                  : <PieChart width={360} height={260} data={pieMarkets.data} />}
              </div>
            </div>

            <div className="rounded-xl border">
              <div className="px-4 py-3 border-b font-medium">Opérations signées par client (barres) & marge moyenne (USD/kg)</div>
              <div className="p-4">
                {barClients.length===0
                  ? <div className="text-sm text-gray-500">Aucune offre acceptée.</div>
                  : <BarChart width={520} height={260} data={barClients} />}
              </div>
            </div>
          </div>

          {/* Relances du jour */}
          <div className="rounded-xl border">
            <div className="px-4 py-3 border-b font-medium">Relances à faire aujourd’hui</div>
            <div className="p-4">
              {!relancesDuJour.length ? <div className="text-sm text-gray-500">Aucune relance due.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-gray-500"><th className="text-left p-2">ID</th><th className="text-left p-2">Client</th><th className="text-left p-2">Marché</th><th className="text-left p-2">Produit</th><th className="text-left p-2">Statut</th><th className="text-left p-2">Prochaine relance</th></tr></thead>
                    <tbody>
                      {relancesDuJour.map(p=>(
                        <tr key={p.id} className="border-t">
                          <td className="p-2">{p.id}</td>
                          <td className="p-2">{p.client}</td>
                          <td className="p-2">{p.marche}</td>
                          <td className="p-2">{p.produit}</td>
                          <td className="p-2">{p.statut}</td>
                          <td className="p-2">{p.relance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROSPECTS */}
      {tab==='prospects' && (
        <div className="space-y-6">
          {/* Formulaire */}
          <div className="rounded-xl border">
            <div className="px-4 py-3 border-b font-medium">Ajouter un prospect</div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Client / Prospect</div>
                <input list="clients-list" className="w-full border rounded-lg px-3 py-2" placeholder="ex: Congelcam" value={pForm.client}
                  onChange={e=>setPForm({...pForm, client:e.target.value})}
                  onBlur={()=>ensureClientInRefs(pForm.client)}
                />
                <datalist id="clients-list">
                  {refs.clients.map(c=><option key={c} value={c} />)}
                </datalist>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Marché</div>
                <select className="w-full border rounded-lg px-3 py-2" value={pForm.marche} onChange={e=>setPForm({...pForm, marche:e.target.value as any})}>
                  {marches.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Produit</div>
                <input list="produits-list" className="w-full border rounded-lg px-3 py-2" value={pForm.produit}
                  onChange={e=>setPForm({...pForm, produit:e.target.value})}
                  onBlur={()=>ensureProduitInRefs(pForm.produit)}
                />
                <datalist id="produits-list">
                  {refs.produits.map(p=><option key={p} value={p} />)}
                </datalist>
              </div>

              <div><div className="text-xs text-gray-500 mb-1">Date 1er contact</div><input type="date" className="w-full border rounded-lg px-3 py-2" value={pForm.dContact||''} onChange={e=>setPForm({...pForm, dContact:e.target.value})}/></div>
              <div><div className="text-xs text-gray-500 mb-1">Offre envoyée ?</div><select className="w-full border rounded-lg px-3 py-2" value={pForm.offre} onChange={e=>setPForm({...pForm, offre:e.target.value as any})}>{ouiNon.map(v=><option key={v} value={v}>{v}</option>)}</select></div>
              <div><div className="text-xs text-gray-500 mb-1">Date offre</div><input type="date" className="w-full border rounded-lg px-3 py-2" value={pForm.dOffre||''} onChange={e=>setPForm({...pForm, dOffre:e.target.value})}/></div>

              <div><div className="text-xs text-gray-500 mb-1">Montant (USD)</div><input type="number" className="w-full border rounded-lg px-3 py-2" value={pForm.montant??''} onChange={e=>setPForm({...pForm, montant:Number(e.target.value)||undefined})}/></div>
              <div><div className="text-xs text-gray-500 mb-1">Statut</div><select className="w-full border rounded-lg px-3 py-2" value={pForm.statut} onChange={e=>setPForm({...pForm, statut:e.target.value as any})}>{statutsProspect.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
              <div><div className="text-xs text-gray-500 mb-1">Prochaine relance</div><input type="date" className="w-full border rounded-lg px-3 py-2" value={pForm.relance||''} onChange={e=>setPForm({...pForm, relance:e.target.value})}/></div>

              <div><div className="text-xs text-gray-500 mb-1">Réponse client ?</div><select className="w-full border rounded-lg px-3 py-2" value={pForm.reponse} onChange={e=>setPForm({...pForm, reponse:e.target.value as any})}>{ouiNon.map(v=><option key={v} value={v}>{v}</option>)}</select></div>
              <div><div className="text-xs text-gray-500 mb-1">Date réponse</div><input type="date" className="w-full border rounded-lg px-3 py-2" value={pForm.dReponse||''} onChange={e=>setPForm({...pForm, dReponse:e.target.value})}/></div>
              <div><div className="text-xs text-gray-500 mb-1">Cause de perte</div><select className="w-full border rounded-lg px-3 py-2" value={pForm.cause||''} onChange={e=>setPForm({...pForm, cause:e.target.value})}><option value="">—</option>{causes.map(c=><option key={c} value={c}>{c}</option>)}</select></div>

              <div className="md:col-span-3">
                <button className="px-4 py-2 rounded-lg bg-blue-600 text-white" onClick={addProspect}>Ajouter</button>
              </div>
            </div>
          </div>

          {/* Liste */}
          <div className="rounded-xl border">
            <div className="px-4 py-3 border-b font-medium">Liste des prospects</div>
            <div className="p-4 overflow-x-auto">
              {!prospects.length ? <div className="text-sm text-gray-500">Aucun prospect pour le moment.</div> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500">
                    <th className="text-left p-2">ID</th><th className="text-left p-2">Client</th><th className="text-left p-2">Marché</th><th className="text-left p-2">Produit</th><th className="text-left p-2">Statut</th><th className="text-left p-2">Relance</th><th className="text-left p-2">Score</th><th className="text-left p-2">Grade</th>
                  </tr></thead>
                  <tbody>
                    {scored.sort((a:any,b:any)=> b._score-a._score).map((p:any)=>(
                      <tr key={p.id} className="border-t">
                        <td className="p-2">{p.id}</td>
                        <td className="p-2">{p.client}</td>
                        <td className="p-2">{p.marche}</td>
                        <td className="p-2">{p.produit}</td>
                        <td className="p-2">
                          <select className="border rounded px-2 py-1" value={p.statut} onChange={e=>updateProspectInline(p.id,{statut:e.target.value as any})}>
                            {statutsProspect.map(s=><option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="p-2"><input type="date" className="border rounded px-2 py-1" value={p.relance||''} onChange={e=>updateProspectInline(p.id,{relance:e.target.value})}/></td>
                        <td className="p-2">{p._score}</td>
                        <td className="p-2">{p._grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OFFRES */}
      {tab==='offres' && (
        <div className="space-y-6">
          {/* Formulaire */}
          <div className="rounded-xl border">
            <div className="px-4 py-3 border-b font-medium">Ajouter une offre</div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Prospect (optionnel)</div>
                <select className="w-full border rounded-lg px-3 py-2" value={oForm.prospectId||''} onChange={e=>{
                  const id = e.target.value || undefined;
                  const pr = prospects.find(p=>p.id===id);
                  setOForm(prev=>({
                    ...prev,
                    prospectId: id,
                    client: pr ? pr.client : prev.client,
                    marche: pr ? pr.marche : prev.marche,
                    produit: pr ? pr.produit : prev.produit
                  }));
                }}>
                  <option value="">—</option>
                  {prospects.map(p=><option key={p.id} value={p.id}>{p.id} — {p.client}</option>)}
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Client</div>
                <input list="clients-list" className="w-full border rounded-lg px-3 py-2" value={oForm.client}
                  onChange={e=>setOForm({...oForm, client:e.target.value})}
                  onBlur={()=>ensureClientInRefs(oForm.client)}
                />
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Marché</div>
                <select className="w-full border rounded-lg px-3 py-2" value={oForm.marche} onChange={e=>setOForm({...oForm, marche:e.target.value as any})}>
                  {marches.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Produit</div>
                <input list="produits-list" className="w-full border rounded-lg px-3 py-2" value={oForm.produit}
                  onChange={e=>setOForm({...oForm, produit:e.target.value})}
                  onBlur={()=>ensureProduitInRefs(oForm.produit)}
                />
              </div>

              <div><div className="text-xs text-gray-500 mb-1">Calibre</div><input className="w-full border rounded-lg px-3 py-2" value={oForm.calibre||''} onChange={e=>setOForm({...oForm, calibre:e.target.value})}/></div>
              <div><div className="text-xs text-gray-500 mb-1">Incoterm</div><select className="w-full border rounded-lg px-3 py-2" value={oForm.incoterm} onChange={e=>setOForm({...oForm, incoterm:e.target.value as any})}><option value="CFR">CFR</option><option value="FOB">FOB</option><option value="CIF">CIF</option></select></div>
              <div><div className="text-xs text-gray-500 mb-1">Prix USD/kg</div><input type="number" className="w-full border rounded-lg px-3 py-2" value={oForm.prix_usd_kg} onChange={e=>setOForm({...oForm, prix_usd_kg:Number(e.target.value)||0})}/></div>
              <div><div className="text-xs text-gray-500 mb-1">Volume (kg)</div><input type="number" className="w-full border rounded-lg px-3 py-2" value={oForm.volume_kg} onChange={e=>setOForm({...oForm, volume_kg:Number(e.target.value)||0})}/></div>
              <div><div className="text-xs text-gray-500 mb-1">Date</div><input type="date" className="w-full border rounded-lg px-3 py-2" value={oForm.date_offre} onChange={e=>setOForm({...oForm, date_offre:e.target.value})}/></div>
              <div><div className="text-xs text-gray-500 mb-1">Validité (jours)</div><input type="number" className="w-full border rounded-lg px-3 py-2" value={oForm.validite_jours??''} onChange={e=>setOForm({...oForm, validite_jours:Number(e.target.value)||undefined})}/></div>
              <div><div className="text-xs text-gray-500 mb-1">Statut</div><select className="w-full border rounded-lg px-3 py-2" value={oForm.statut_offre} onChange={e=>setOForm({...oForm, statut_offre:e.target.value as any})}>{statutsOffre.map(s=><option key={s} value={s}>{s}</option>)}</select></div>

              <div className="md:col-span-3">
                {suggestion ? <div className="text-xs text-gray-600 mb-2">Suggestion prix 30j : médiane <b>{suggestion.mediane?.toFixed(2)}</b> USD/kg (min {suggestion.min.toFixed(2)} – max {suggestion.max.toFixed(2)})</div> : <div className="text-xs text-gray-400 mb-2">Aucune référence 30j pour ce paramétrage.</div>}
                <button className="px-4 py-2 rounded-lg bg-blue-600 text-white" onClick={addOffre}>Enregistrer l’offre</button>
              </div>
            </div>
          </div>

          {/* Historique */}
          <div className="rounded-xl border">
            <div className="px-4 py-3 border-b font-medium">Historique des offres</div>
            <div className="p-4 overflow-x-auto">
              {!offres.length ? <div className="text-sm text-gray-500">Aucune offre pour le moment.</div> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500">
                    <th className="text-left p-2">ID</th><th className="text-left p-2">Prospect</th><th className="text-left p-2">Client</th>
                    <th className="text-left p-2">Produit</th><th className="text-left p-2">Calibre</th><th className="text-left p-2">Incoterm</th>
                    <th className="text-left p-2">Prix USD/kg</th><th className="text-left p-2">Volume (kg)</th>
                    <th className="text-left p-2">Date</th><th className="text-left p-2">Validité</th><th className="text-left p-2">Statut</th>
                  </tr></thead>
                  <tbody>
                    {offres.map(o=>(
                      <tr key={o.id} className="border-t">
                        <td className="p-2">{o.id}</td>
                        <td className="p-2">{o.prospectId||'—'}</td>
                        <td className="p-2">{o.client}</td>
                        <td className="p-2">{o.produit}</td>
                        <td className="p-2">{o.calibre||'—'}</td>
                        <td className="p-2">{o.incoterm}</td>
                        <td className="p-2">{o.prix_usd_kg}</td>
                        <td className="p-2">{o.volume_kg}</td>
                        <td className="p-2">{o.date_offre}</td>
                        <td className="p-2">{o.validite_jours??'—'}</td>
                        <td className="p-2">
                          <select className="border rounded px-2 py-1" value={o.statut_offre||'Envoyée'} onChange={e=>updateOffreInline(o.id,{statut_offre:e.target.value as any})}>
                            {statutsOffre.map(s=><option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RÉFÉRENTIELS */}
      {tab==='referentiels' && (
        <div className="space-y-6">
          <div className="rounded-xl border">
            <div className="px-4 py-3 border-b font-medium">Clients</div>
            <div className="p-4 space-y-3">
              <RefEditor
                items={refs.clients}
                placeholder="Ajouter un client…"
                onChange={vals=>setRefs({...refs, clients: vals})}
              />
            </div>
          </div>
          <div className="rounded-xl border">
            <div className="px-4 py-3 border-b font-medium">Produits</div>
            <div className="p-4 space-y-3">
              <RefEditor
                items={refs.produits}
                placeholder="Ajouter un produit…"
                onChange={vals=>setRefs({...refs, produits: vals})}
              />
            </div>
          </div>
        </div>
      )}

      {/* SAISONNIER (placeholder) */}
      {tab==='saisonnier' && (
        <div className="rounded-xl border">
          <div className="px-4 py-3 border-b font-medium">Analyse saisonnière</div>
          <div className="p-4 text-sm text-gray-600">
            Ajoute ici tes graphes saisonniers (prix moyens par espèce / mois).
          </div>
        </div>
      )}
    </div>
  );
}

/* ===========================
   Petits composants
=========================== */
function Kpi({title,value}:{title:string;value:string}){
  return (
    <div className="p-4 rounded-xl border">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function RefEditor({items, placeholder, onChange}:{items:string[]; placeholder:string; onChange:(vals:string[])=>void}){
  const [val,setVal]=useState('');
  return (
    <div>
      <div className="flex gap-2">
        <input className="flex-1 border rounded-lg px-3 py-2" placeholder={placeholder} value={val} onChange={e=>setVal(e.target.value)}/>
        <button className="px-3 py-2 rounded-lg bg-blue-600 text-white" onClick={()=>{ if(val.trim()){ onChange([...(items||[]), val.trim()]); setVal(''); } }}>Ajouter</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(items||[]).map((it,i)=>(
          <span key={i} className="px-2.5 py-1 rounded-full border">{it}
            <button className="ml-2 text-xs text-red-500" onClick={()=>onChange(items.filter((_,k)=>k!==i))}>×</button>
          </span>
        ))}
        {!items?.length && <div className="text-sm text-gray-500">Aucune entrée.</div>}
      </div>
    </div>
  );
}

/* ===========================
   Graphiques SVG
=========================== */
function PieChart({width,height,data}:{width:number;height:number;data:{label:string;value:number}[]}) {
  const r = Math.min(width,height)/2 - 10;
  const cx = width/2, cy = height/2;
  const total = data.reduce((s,d)=>s+d.value,0) || 1;

  let angleStart = -Math.PI/2;
  const colors = ['#2563eb','#16a34a','#f97316','#a855f7','#0891b2','#dc2626','#0ea5e9','#84cc16'];

  return (
    <svg width={width} height={height}>
      {data.map((d,i)=>{
        const angle = (d.value/total) * Math.PI*2;
        const angleEnd = angleStart + angle;
        const x1 = cx + r*Math.cos(angleStart);
        const y1 = cy + r*Math.sin(angleStart);
        const x2 = cx + r*Math.cos(angleEnd);
        const y2 = cy + r*Math.sin(angleEnd);
        const large = angle > Math.PI ? 1 : 0;
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        const mid = angleStart + angle/2;
        const lx = cx + (r+14)*Math.cos(mid);
        const ly = cy + (r+14)*Math.sin(mid);
        angleStart = angleEnd;
        return (
          <g key={i}>
            <path d={path} fill={colors[i%colors.length]} opacity={0.9}/>
            <text x={lx} y={ly} fontSize="10" textAnchor="middle" dominantBaseline="middle" fill="#334155">
              {d.label} ({Math.round(d.value/total*100)}%)
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function BarChart({width,height,data}:{width:number;height:number;data:{client:string;count:number;avgMargin:number}[]}) {
  const padding = {l:40, r:20, t:10, b:50};
  const w = width - padding.l - padding.r;
  const h = height - padding.t - padding.b;
  const maxCount = Math.max(1, ...data.map(d=>d.count));
  const barW = Math.max(12, Math.floor(w / data.length) - 8);

  return (
    <svg width={width} height={height}>
      {/* axes */}
      <line x1={padding.l} y1={padding.t} x2={padding.l} y2={padding.t+h} stroke="#cbd5e1"/>
      <line x1={padding.l} y1={padding.t+h} x2={padding.l+w} y2={padding.t+h} stroke="#cbd5e1"/>

      {data.map((d,i)=>{
        const x = padding.l + i*(barW+8);
        const barH = Math.round((d.count/maxCount)*h);
        const y = padding.t + (h - barH);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill="#2563eb" opacity={0.9} />
            <text x={x+barW/2} y={y-6} fontSize="10" textAnchor="middle" fill="#111827">
              {d.avgMargin.toFixed(2)}
            </text>
            <text x={x+barW/2} y={padding.t+h+12} fontSize="10" textAnchor="end" transform={`rotate(45 ${x+barW/2},${padding.t+h+12})`} fill="#334155">
              {d.client}
            </text>
          </g>
        );
      })}

      {/* graduations Y (counts) */}
      {[0,0.25,0.5,0.75,1].map((t,i)=>{
        const y = padding.t + h - t*h;
        const val = Math.round(maxCount*t);
        return (
          <g key={i}>
            <line x1={padding.l-3} x2={padding.l} y1={y} y2={y} stroke="#64748b"/>
            <text x={padding.l-6} y={y} fontSize="10" textAnchor="end" dominantBaseline="central" fill="#64748b">{val}</text>
          </g>
        );
      })}
    </svg>
  );
}
