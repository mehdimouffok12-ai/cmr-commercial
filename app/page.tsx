'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Prospect, Offre, Refs,
  loadProspects, saveProspects,
  loadOffres, saveOffres,
  loadRefs, saveRefs, upsertClient, upsertProduit,
  getUsdEur, resetAll, nextId, addDays, monthStr
} from '../components/storage';

// --- Constantes ---
const marches = ['Maroc','GCC','Afrique de l’Ouest','Autres'] as const;
const statutsProspect = ['À qualifier','Offre envoyée','En négociation','Perdu','Signé'] as const;
const ouiNon = ['Oui','Non'] as const;
const causes = ['Prix','Disponibilité','Délai','Qualité','Conditions','Autre'] as const;
const statutsOffre = ['Envoyée','En négociation','Acceptée','Refusée'] as const;

function fmtUSD(v?: number|null, digits=2){ if(v==null||isNaN(v)) return '—'; return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:digits}).format(v); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function diffDays(aISO?: string, bISO?: string){ if(!aISO||!bISO) return null; return Math.round((new Date(aISO).getTime()-new Date(bISO).getTime())/86400000); }

// --- Scoring ---
function scoreProspect(p: Prospect, offres: Offre[], interactions30j: number) {
  const lastDate = p.relance || p.dContact;
  const daysSince = lastDate ? Math.max(0, diffDays(todayStr(), lastDate) || 0) : 999;
  const recence = Math.max(0, 100 - Math.min(100, daysSince*5)); // 0..100
  const freq = Math.min(100, interactions30j*25);
  const pot = offres
    .filter(o => o.client.toLowerCase()===p.client.toLowerCase() && (!o.statut_offre || ['Envoyée','En négociation'].includes(o.statut_offre)))
    .reduce((s,o)=> s + (o.prix_usd_kg * o.volume_kg), 0);
  const potScaled = Math.min(100, Math.log10(1 + pot/1000) * 40);
  const vitesse = p.reponse==='Oui' && p.dReponse ? Math.max(0, 100 - Math.min(100, (diffDays(p.dReponse, p.dContact) || 0)*10)) : 50;
  const statutW = { 'Signé':100, 'En négociation':70, 'Offre envoyée':40, 'À qualifier':20, 'Perdu':0 } as const;
  const statutScore = statutW[p.statut] ?? 0;

  const score = Math.round(0.30*recence + 0.20*freq + 0.25*potScaled + 0.15*vitesse + 0.10*statutScore);
  const grade = score>=75?'A' : score>=60?'B' : score>=40?'C' : 'D';
  const nba = grade==='A' ? 'Relancer aujourd’hui (prix/marge)'
    : grade==='B' ? 'Demander feedback précis (points bloquants)'
    : grade==='C' ? 'Envoyer info marché + alternative'
    : 'Parking 30j, relance soft';

  return { score, grade, nba };
}

// --- Suggestions d’offres (médiane 30j) ---
function median(nums: number[]){ if(nums.length===0) return null; const s=[...nums].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2; }
function suggestPrice(offres: Offre[], params: {produit: string; marche: string; incoterm: Offre['incoterm']; calibre?: string}) {
  const now = new Date().getTime();
  const days30 = 30*86400000;
  const same = offres.filter(o=>{
    const okTime = now - new Date(o.date_offre).getTime() <= days30;
    const ok = o.produit===params.produit && o.marche===params.marche && o.incoterm===params.incoterm;
    const okCal = params.calibre ? (o.calibre||'')===params.calibre : true;
    return okTime && ok && okCal;
  }).map(o => o.prix_usd_kg);
  const med = median(same);
  if (med==null) return null;
  const min = Math.min(...same), max = Math.max(...same);
  return { mediane: med, min, max };
}

// --- Validité & SLA ---
function isExpiring(o: Offre){ if(!o.validite_jours) return false; const exp = addDays(o.date_offre, o.validite_jours); return diffDays(exp, todayStr())!==null && (diffDays(exp, todayStr()) as number) <= 3; }
function slaDue(p: Prospect){
  if (p.offre!=='Oui' || !p.dOffre) return null;
  const d2 = addDays(p.dOffre, 2);
  const d7 = addDays(p.dOffre, 7);
  const today = todayStr();
  if (d2<=today && (p.reponse!=='Oui')) return 'Relance J+2 due';
  if (d7<=today && (p.reponse!=='Oui')) return 'Relance J+7 due';
  return null;
}

// --- App ---
export default function App(){
  const [tab,setTab] = useState<'dashboard'|'prospects'|'offres'|'referentiels'|'saisonnier'>('dashboard');

  const [prospects,setProspects]=useState<Prospect[]>([]);
  const [offres,setOffres]=useState<Offre[]>([]);
  const [refs,setRefs]=useState<Refs>({clients:[], produits:[], benchmarks:[]});
  const [usdEur,setUsdEur]=useState<number>(0.92);

  useEffect(()=>{ setProspects(loadProspects()); setOffres(loadOffres()); setRefs(loadRefs()); },[]);
  useEffect(()=>{ saveProspects(prospects); },[prospects]);
  useEffect(()=>{ saveOffres(offres); },[offres]);
  useEffect(()=>{ saveRefs(refs); },[refs]);
  useEffect(()=>{ getUsdEur().then(setUsdEur); },[]);

  const [pForm,setPForm]=useState<Prospect>({
    id:'', client:'', marche:'Maroc', produit:'', dContact: todayStr(),
    offre:'Non', dOffre:'', montant: undefined, statut:'À qualifier',
    relance:'', reponse:'Non', dReponse:'', cause:'', fournisseur:'', dSignature:'', note:''
  });
  useEffect(()=>{ setPForm(prev=> ({...prev, produit: prev.produit || (refs.produits[0]||'')})); },[refs]);

  const [oForm,setOForm]=useState<Offre>({
    id:'', client:'', marche:'Maroc', produit:'', calibre:'',
    incoterm:'CFR', prix_usd_kg:0, volume_kg:0,
    date_offre: todayStr(), validite_jours:15, statut_offre:'Envoyée',
    prix_achat_usd_kg: undefined, fret_usd_kg: undefined, autres_frais_usd_kg: undefined, note:''
  });
  useEffect(()=>{ setOForm(prev=> ({...prev, produit: prev.produit || (refs.produits[0]||'')})); },[refs]);

  const offresEnv = prospects.filter(p=>p.offre==='Oui').length;
  const reps = prospects.filter(p=>p.reponse==='Oui').length;
  const signes = prospects.filter(p=>p.statut==='Signé').length;
  const tauxReponse = offresEnv? (reps/offresEnv):0;
  const tauxConv = offresEnv? (signes/offresEnv):0;

  const ajd = todayStr();
  const relancesDuJour = useMemo(()=> prospects.filter(p=> p.relance && p.relance<=ajd && !['Signé','Perdu'].includes(p.statut)),[prospects]);

  const offresQuiExpirent = offres.filter(isExpiring);
  const scored = useMemo(()=>{
    return prospects.map(p=>{
      const interactions30 = offres.filter(o => o.client.toLowerCase()===p.client.toLowerCase() && (diffDays(todayStr(), o.date_offre) as number) <= 30).length;
      const s = scoreProspect(p, offres, interactions30);
      return { ...p, _score:s.score, _grade:s.grade, _nba:s.nba };
    }).sort((a,b)=> (b as any)._score - (a as any)._score);
  },[prospects,offres]);

  const suggestion = useMemo(()=>{
    if (!oForm.produit || !oForm.marche || !oForm.incoterm) return null;
    return suggestPrice(offres, { produit: oForm.produit, marche: oForm.marche, incoterm: oForm.incoterm, calibre: oForm.calibre });
  },[oForm,offres]);

  function addProspect(){
    if(!pForm.client.trim()) return alert('Client / Prospect obligatoire');
    if(!pForm.produit) return alert('Produit obligatoire');
    if(pForm.offre==='Oui' && !pForm.dOffre) return alert("Date d'offre requise");
    if(pForm.reponse==='Oui' && !pForm.dReponse) return alert("Date de réponse requise");
    if(pForm.statut==='Signé' && !pForm.dSignature) return alert("Date de signature requise");

    const rec: Prospect = { ...pForm, id: nextId('PR', prospects), montant: pForm.montant ?? null };
    setProspects([rec, ...prospects]);
    upsertClient(rec.client); setRefs(loadRefs());
    upsertProduit(rec.produit); setRefs(loadRefs());

    setPForm({
      id:'', client:'', marche:'Maroc', produit: refs.produits[0]||'',
      dContact: todayStr(), offre:'Non', dOffre:'', montant: undefined,
      statut:'À qualifier', relance:'', reponse:'Non', dReponse:'',
      cause:'', fournisseur:'', dSignature:'', note:''
    });
    alert('Prospect ajouté ✅');
  }

  function addOffre(){
    if(!oForm.client.trim()) return alert('Client / Prospect obligatoire');
    if(!oForm.produit) return alert('Produit obligatoire');
    if(!oForm.prix_usd_kg || oForm.prix_usd_kg<=0) return alert('Prix USD/kg requis (>0)');
    if(!oForm.volume_kg || oForm.volume_kg<=0) return alert('Volume (kg) requis (>0)');

    if (suggestion?.mediane){
      const delta = Math.abs(oForm.prix_usd_kg - suggestion.mediane) / suggestion.mediane;
      if (delta > 0.03 && !confirm(`⚠️ Prix s’écarte de ${(delta*100).toFixed(1)}% de la médiane (${suggestion.mediane.toFixed(2)} USD/kg). Continuer ?`)) {
        return;
      }
    }

    const pMatch = [...prospects].filter(p => p.client.toLowerCase()===oForm.client.toLowerCase()).sort((a,b)=> (b.dContact||'').localeCompare(a.dContact||''));
    const prospectId = pMatch.length ? pMatch[0].id : undefined;

    const rec: Offre = { ...oForm, id: nextId('OF', offres), prospectId };
    setOffres([rec, ...offres]);

    if (prospectId){
      setProspects(prev => prev.map(p => p.id===prospectId ? {
        ...p, offre:'Oui', dOffre:oForm.date_offre, statut: p.statut==='À qualifier' ? 'Offre envoyée' : p.statut
      } : p));
    }
    upsertClient(oForm.client); setRefs(loadRefs());
    upsertProduit(oForm.produit); setRefs(loadRefs());

    setOForm({
      id:'', client:'', marche:'Maroc', produit: refs.produits[0]||'',
      calibre:'', incoterm:'CFR', prix_usd_kg:0, volume_kg:0,
      date_offre: todayStr(), validite_jours:15, statut_offre:'Envoyée',
      prix_achat_usd_kg: undefined, fret_usd_kg: undefined, autres_frais_usd_kg: undefined, note:''
    });
    alert('Offre enregistrée ✅');
  }

  function updateProspectInline(id: string, patch: Partial<Prospect>) {
    setProspects(prev => prev.map(p => p.id===id ? {...p, ...patch} : p));
  }

  function resetData(){
    if(confirm('Réinitialiser toutes les données (prospects, offres, référentiels, FX) ?')) { resetAll(); location.reload(); }
  }

  function exportJSON(){
    const blob = new Blob([JSON.stringify({prospects, offres, refs}, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cmr_backup_${todayStr()}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  const fileRef = useRef<HTMLInputElement>(null);
  async function importJSON(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0]; if(!f) return;
    const txt = await f.text();
    try{
      const j = JSON.parse(txt);
      if (j.prospects) setProspects(j.prospects);
      if (j.offres) setOffres(j.offres);
      if (j.refs) setRefs(j.refs);
      alert('Import réussi ✅');
    }catch{ alert('Fichier invalide'); }
    e.target.value = '';
  }

  const cout_usd_kg = (oForm.prix_achat_usd_kg||0) + (oForm.fret_usd_kg||0) + (oForm.autres_frais_usd_kg||0);
  const marge_usd_kg = (oForm.prix_usd_kg||0) - (cout_usd_kg||0);
  const marge_totale = marge_usd_kg * (oForm.volume_kg||0);

  const produitsList = refs.produits.length? refs.produits : ['Crevette Vannamei (Équateur)'];

  // UI helper: Tab button
  const TabBtn = ({id,label}:{id:any;label:string})=>(
    <button
      className={`px-4 py-2 rounded-xl border ${tab===id?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 hover:bg-gray-50'}`}
      onClick={()=>setTab(id)}
    >
      {label}
    </button>
  ); // <<< IMPORTANT : on ferme bien la fonction avant le return principal

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold">CMR Commercial – Eurotrade</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={()=>setTab('prospects')}>+ Prospect</button>
          <button className="btn" onClick={()=>setTab('offres')}>+ Offre</button>
          <button className="px-4 py-2 rounded-xl border" onClick={exportJSON}>Exporter JSON</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importJSON}/>
          <button className="px-4 py-2 rounded-xl border" onClick={()=>fileRef.current?.click()}>Importer JSON</button>
          <button className="px-4 py-2 rounded-xl border border-red-300 text-red-700 hover:bg-red-50" onClick={resetData}>Réinitialiser</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <TabBtn id="dashboard" label="Dashboard" />
        <TabBtn id="prospects" label="Prospects" />
        <TabBtn id="offres" label="Offres (USD/kg)" />
        <TabBtn id="referentiels" label="Référentiels" />
        <TabBtn id="saisonnier" label="Saisonnier" />
      </div>

      <AnimatePresence mode="wait">
        {tab==='dashboard' && (
          <motion.div key="dash" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.15}} className="space-y-6">
            <div className="card"><div className="card-body text-sm flex flex-wrap gap-6 items-center">
              <div><b>Rappels du jour :</b> {relancesDuJour.length===0 ? 'aucune relance due' : `${relancesDuJour.length} relance(s)`}</div>
              <div><b>Offres expirant &lt;72h :</b> {offresQuiExpirent.length}</div>
              <div><b>USD→EUR :</b> {(usdEur||0).toFixed(4)}</div>
            </div></div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card"><div className="card-body"><div className="text-gray-500 text-sm">Taux de réponse</div><div className="text-2xl font-semibold">{(tauxReponse*100).toFixed(0)}%</div></div></div>
              <div className="card"><div className="card-body"><div className="text-gray-500 text-sm">Taux de conversion</div><div className="text-2xl font-semibold">{(tauxConv*100).toFixed(0)}%</div></div></div>
              <div className="card"><div className="card-body"><div className="text-gray-500 text-sm">Prospects actifs</div><div className="text-2xl font-semibold">{prospects.length}</div></div></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <div className="card-header">Relances à faire aujourd’hui</div>
                <div className="card-body overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead><tr>{['ID','Client','Marché','Produit','Statut','Relance','SLA'].map(h => <th key={h} className='th'>{h}</th>)}</tr></thead>
                    <tbody>
                      {relancesDuJour.map(r => (
                        <tr key={r.id}>
                          <td className='td'>{r.id}</td><td className='td'>{r.client}</td><td className='td'>{r.marche}</td><td className='td'>{r.produit}</td><td className='td'>{r.statut}</td><td className='td'>{r.relance}</td><td className='td'>{slaDue(r)||'—'}</td>
                        </tr>
                      ))}
                      {relancesDuJour.length===0 && <tr><td className='td text-center text-gray-500' colSpan={7}>Aucune relance due.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-header">Offres qui expirent &lt; 72h</div>
                <div className="card-body overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead><tr>{['ID','Client','Produit','Incoterm','Prix USD/kg','Date','Validité','Expire le'].map(h => <th key={h} className='th'>{h}</th>)}</tr></thead>
                    <tbody>
                      {offresQuiExpirent.map(o => (
                        <tr key={o.id}>
                          <td className="td">{o.id}</td><td className="td">{o.client}</td><td className="td">{o.produit}</td><td className="td">{o.incoterm}</td>
                          <td className="td">{o.prix_usd_kg.toFixed(2)}</td><td className="td">{o.date_offre}</td><td className="td">{o.validite_jours||'—'}</td><td className="td">{o.validite_jours? addDays(o.date_offre, o.validite_jours):'—'}</td>
                        </tr>
                      ))}
                      {offresQuiExpirent.length===0 && <tr><td className='td text-center text-gray-500' colSpan={8}>Aucune expiration proche.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">Priorités (Scoring A/B/C/D)</div>
              <div className="card-body overflow-auto">
                <table className="min-w-full text-sm">
                  <thead><tr>{['Score','Grade','Client','Produit','Statut','Relance','Next Best Action'].map(h => <th key={h} className='th'>{h}</th>)}</tr></thead>
                  <tbody>
                    {scored.map(p=>(
                      <tr key={p.id}>
                        <td className="td font-medium">{(p as any)._score}</td>
                        <td className="td">{(p as any)._grade}</td>
                        <td className="td">{p.client}</td>
                        <td className="td">{p.produit}</td>
                        <td className="td">{p.statut}</td>
                        <td className="td">{p.relance||'—'}</td>
                        <td className="td">{(p as any)._nba}</td>
                      </tr>
                    ))}
                    {scored.length===0 && <tr><td className='td text-center text-gray-500' colSpan={7}>Aucun prospect.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {tab==='prospects' && (
          <motion.div key="pros" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.15}} className="space-y-6">
            <div className="card">
              <div className="card-header">Ajouter un prospect</div>
              <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-gray-600">Client / Prospect</label>
                  <input list="lstClients" className="input" placeholder="ex: Congelcam" value={pForm.client} onChange={e=>setPForm({...pForm, client:e.target.value})}/>
                  <datalist id="lstClients">
                    {refs.clients.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div><label className="text-sm text-gray-600">Marché</label>
                  <select className="select" value={pForm.marche} onChange={e=>setPForm({...pForm, marche:e.target.value as any})}>
                    {marches.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Produit</label>
                  <input list="lstProduits" className="input" value={pForm.produit} onChange={e=>setPForm({...pForm, produit:e.target.value})}/>
                  <datalist id="lstProduits">
                    {refs.produits.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>

                <div><label className="text-sm text-gray-600">Date 1er contact</label><input className="input" type="date" value={pForm.dContact} onChange={e=>setPForm({...pForm, dContact:e.target.value})}/></div>
                <div><label className="text-sm text-gray-600">Offre envoyée ?</label><select className="select" value={pForm.offre} onChange={e=>setPForm({...pForm, offre:e.target.value as any})}>{ouiNon.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
                <div><label className="text-sm text-gray-600">Date offre</label><input className="input" type="date" value={pForm.dOffre} onChange={e=>setPForm({...pForm, dOffre:e.target.value})}/></div>

                <div><label className="text-sm text-gray-600">Montant (USD)</label><input className="input" type="number" placeholder="95000" value={(pForm.montant as any)??''} onChange={e=>setPForm({...pForm, montant: e.target.value? Number(e.target.value): undefined})}/></div>
                <div><label className="text-sm text-gray-600">Statut</label><select className="select" value={pForm.statut} onChange={e=>setPForm({...pForm, statut:e.target.value as any})}>{statutsProspect.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="text-sm text-gray-600">Prochaine relance</label><input className="input" type="date" value={pForm.relance} onChange={e=>setPForm({...pForm, relance:e.target.value})}/></div>

                <div><label className="text-sm text-gray-600">Réponse client ?</label><select className="select" value={pForm.reponse} onChange={e=>setPForm({...pForm, reponse:e.target.value as any})}>{ouiNon.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
                <div><label className="text-sm text-gray-600">Date réponse</label><input className="input" type="date" value={pForm.dReponse} onChange={e=>setPForm({...pForm, dReponse:e.target.value})}/></div>
                <div><label className="text-sm text-gray-600">Cause de perte</label>
                  <select className="select" value={pForm.cause} onChange={e=>setPForm({...pForm, cause:e.target.value})}><option value="">—</option>{causes.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </div>
              </div>
              <div className="card-body flex justify-end"><button className="btn" onClick={addProspect}>Ajouter</button></div>
            </div>

            <div className="card">
              <div className="card-header">Liste des prospects (édition inline Statut / Relance)</div>
              <div className="card-body overflow-auto">
                <table className="min-w-full text-sm">
                  <thead><tr>{['Score','Grade','ID','Client','Marché','Produit','Statut','Relance','SLA'].map(h => <th key={h} className='th'>{h}</th>)}</tr></thead>
                  <tbody>
                    {scored.map((p:any)=>(
                      <tr key={p.id}>
                        <td className="td font-medium">{p._score}</td>
                        <td className="td">{p._grade}</td>
                        <td className="td">{p.id}</td>
                        <td className="td">{p.client}</td>
                        <td className="td">{p.marche}</td>
                        <td className="td">{p.produit}</td>
                        <td className="td">
                          <select className="select" value={p.statut} onChange={e=>updateProspectInline(p.id,{statut: e.target.value as any})}>
                            {statutsProspect.map(s=> <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="td">
                          <input className="input" type="date" value={p.relance||''} onChange={e=>updateProspectInline(p.id,{relance: e.target.value})}/>
                        </td>
                        <td className="td">{slaDue(p)||'—'}</td>
                      </tr>
                    ))}
                    {scored.length===0 && <tr><td className="td text-center text-gray-500" colSpan={9}>Aucun prospect.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {tab==='offres' && (
          <motion.div key="off" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.15}} className="space-y-6">
            <div className="card">
              <div className="card-header">Nouvelle offre (USD/kg)</div>
              <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-gray-600">Lier à un prospect</label>
                  <select className="select" value={(oForm as any).prospectId||''} onChange={e=>{
                    const id = e.target.value || undefined;
                    const p = prospects.find(x=>x.id===id);
                    setOForm(prev => ({
                      ...prev,
                      // @ts-ignore
                      prospectId: id,
                      client: p?.client || prev.client,
                      marche: p?.marche || prev.marche,
                      produit: p?.produit || prev.produit,
                      date_offre: todayStr()
                    }));
                  }}>
                    <option value="">—</option>
                    {prospects.map(p=> <option key={p.id} value={p.id}>{p.id} — {p.client}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Client / Prospect</label>
                  <input list="lstClients" className="input" placeholder="ex: SONAL" value={oForm.client} onChange={e=>setOForm({...oForm, client:e.target.value})}/>
                </div>

                <div><label className="text-sm text-gray-600">Marché</label>
                  <select className="select" value={oForm.marche} onChange={e=>setOForm({...oForm, marche:e.target.value as any})}>
                    {marches.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-gray-600">Produit</label>
                  <input list="lstProduits" className="input" value={oForm.produit} onChange={e=>setOForm({...oForm, produit:e.target.value})}/>
                </div>

                <div><label className="text-sm text-gray-600">Calibre / Format</label><input className="input" placeholder="20/30 IQF" value={oForm.calibre||''} onChange={e=>setOForm({...oForm, calibre:e.target.value})}/></div>
                <div><label className="text-sm text-gray-600">Incoterm</label><select className="select" value={oForm.incoterm} onChange={e=>setOForm({...oForm, incoterm:e.target.value as any})}>{['FOB','CFR','CIF','EXW'].map(i=><option key={i} value={i}>{i}</option>)}</select></div>

                <div><label className="text-sm text-gray-600">Prix (USD/kg)</label><input className="input" type="number" step="0.01" placeholder="6.80" value={oForm.prix_usd_kg} onChange={e=>setOForm({...oForm, prix_usd_kg:Number(e.target.value)})}/></div>
                <div><label className="text-sm text-gray-600">Volume (kg)</label><input className="input" type="number" placeholder="24000" value={oForm.volume_kg} onChange={e=>setOForm({...oForm, volume_kg:Number(e.target.value)})}/></div>
                <div><label className="text-sm text-gray-600">Date offre</label><input className="input" type="date" value={oForm.date_offre} onChange={e=>setOForm({...oForm, date_offre:e.target.value})}/></div>
                <div><label className="text-sm text-gray-600">Validité (jours)</label><input className="input" type="number" value={oForm.validite_jours||''} onChange={e=>setOForm({...oForm, validite_jours:e.target.value?Number(e.target.value):undefined})}/></div>
                <div><label className="text-sm text-gray-600">Statut</label><select className="select" value={oForm.statut_offre} onChange={e=>setOForm({...oForm, statut_offre:e.target.value as any})}>{['Envoyée','En négociation','Acceptée','Refusée'].map(s=><option key={s} value={s}>{s}</option>)}</select></div>

                {/* Simulateur marge */}
                <div><label className="text-sm text-gray-600">Prix achat (USD/kg)</label><input className="input" type="number" step="0.01" value={oForm.prix_achat_usd_kg??''} onChange={e=>setOForm({...oForm, prix_achat_usd_kg:e.target.value?Number(e.target.value):undefined})}/></div>
                <div><label className="text-sm text-gray-600">Fret (USD/kg)</label><input className="input" type="number" step="0.01" value={oForm.fret_usd_kg??''} onChange={e=>setOForm({...oForm, fret_usd_kg:e.target.value?Number(e.target.value):undefined})}/></div>
                <div><label className="text-sm text-gray-600">Autres frais (USD/kg)</label><input className="input" type="number" step="0.01" value={oForm.autres_frais_usd_kg??''} onChange={e=>setOForm({...oForm, autres_frais_usd_kg:e.target.value?Number(e.target.value):undefined})}/></div>

                {suggestion && (
                  <div className="md:col-span-3 text-sm text-gray-600">
                    Suggestion (30j, {oForm.marche} / {oForm.produit} / {oForm.incoterm}) :
                    médiane <b>{suggestion.mediane.toFixed(2)} USD/kg</b> — min {suggestion.min.toFixed(2)} — max {suggestion.max.toFixed(2)}.
                  </div>
                )}

                <div className="md:col-span-3 text-sm">
                  <b>Coût total</b>: {fmtUSD(cout_usd_kg)} /kg — <b>Marge</b>: {fmtUSD(marge_usd_kg)} /kg, {fmtUSD(marge_totale,0)} totale.
                </div>

                <div className="md:col-span-3"><label className="text-sm text-gray-600">Note</label><input className="input" placeholder="Conditions, navire, délai..." value={oForm.note||''} onChange={e=>setOForm({...oForm, note:e.target.value})}/></div>
              </div>
              <div className="card-body flex justify-end"><button className="btn" onClick={addOffre}>Enregistrer l’offre</button></div>
            </div>

            <div className="card">
              <div className="card-header">Historique des offres</div>
              <div className="card-body overflow-auto">
                <table className="min-w-full text-sm">
                  <thead><tr>{['ID','Prospect','Client','Marché','Produit','Calibre','Incoterm','Prix USD/kg','Volume (kg)','Date','Validité','Statut'].map(h => <th key={h} className='th'>{h}</th>)}</tr></thead>
                  <tbody>
                    {offres.map(o=>(
                      <tr key={o.id}>
                        <td className="td">{o.id}</td>
                        <td className="td">{o.prospectId || '—'}</td>
                        <td className="td">{o.client}</td>
                        <td className="td">{o.marche}</td>
                        <td className="td">{o.produit}</td>
                        <td className="td">{o.calibre||'—'}</td>
                        <td className="td">{o.incoterm}</td>
                        <td className="td font-medium">{o.prix_usd_kg.toFixed(2)}</td>
                        <td className="td">{o.volume_kg.toLocaleString()}</td>
                        <td className="td">{o.date_offre}</td>
                        <td className="td">{o.validite_jours||'—'}</td>
                        <td className="td">{o.statut_offre}</td>
                      </tr>
                    ))}
                    {offres.length===0 && <tr><td className="td text-center text-gray-500" colSpan={12}>Aucune offre enregistrée.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {tab==='referentiels' && (
          <motion.div key="refs" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.15}} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <div className="card-header">Clients / Prospects (liste de base)</div>
              <div className="card-body space-y-3">
                <form className="flex gap-2" onSubmit={e=>{e.preventDefault(); const inp=(e.currentTarget.elements.namedItem('newClient') as HTMLInputElement); const v=inp.value.trim(); if(v){ setRefs(r=>({...r, clients:[v, ...r.clients.filter(x=>x.toLowerCase()!==v.toLowerCase())]})); inp.value=''; }}}>
                  <input name="newClient" className="input" placeholder="Ajouter un client / prospect" />
                  <button className="btn" type="submit">Ajouter</button>
                </form>
                <ul className="list-disc pl-5">
                  {refs.clients.map(c => (
                    <li key={c} className="flex items-center justify-between">
                      <span>{c}</span>
                      <button className="text-red-600" onClick={()=> setRefs(r=>({...r, clients: r.clients.filter(x=>x!==c)}))}>Supprimer</button>
                    </li>
                  ))}
                  {refs.clients.length===0 && <li className="text-gray-500">Liste vide.</li>}
                </ul>
              </div>
            </div>

            <div className="card">
              <div className="card-header">Produits (liste de base)</div>
              <div className="card-body space-y-3">
                <form className="flex gap-2" onSubmit={e=>{e.preventDefault(); const inp=(e.currentTarget.elements.namedItem('newProd') as HTMLInputElement); const v=inp.value.trim(); if(v){ setRefs(r=>({...r, produits:[v, ...r.produits.filter(x=>x.toLowerCase()!==v.toLowerCase())]})); inp.value=''; }}}>
                  <input name="newProd" className="input" placeholder="Ajouter un produit" />
                  <button className="btn" type="submit">Ajouter</button>
                </form>
                <ul className="list-disc pl-5">
                  {refs.produits.map(p => (
                    <li key={p} className="flex items-center justify-between">
                      <span>{p}</span>
                      <button className="text-red-600" onClick={()=> setRefs(r=>({...r, produits: r.produits.filter(x=>x!==p)}))}>Supprimer</button>
                    </li>
                  ))}
                  {refs.produits.length===0 && <li className="text-gray-500">Liste vide.</li>}
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {tab==='saisonnier' && (
          <motion.div key="season" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.15}} className="card">
            <div className="card-header">Analyse saisonnière (simple)</div>
            <div className="card-body overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">Produit</th>
                    {Array.from({length:12}).map((_,i)=>{
                      const m = String(i+1).padStart(2,'0');
                      const y = new Date().getFullYear();
                      return <th key={m} className="th">{y}-{m}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {produitsList.map(prod=>{
                    return (
                      <tr key={prod}>
                        <td className="td font-medium">{prod}</td>
                        {Array.from({length:12}).map((_,i)=>{
                          const mo = `${new Date().getFullYear()}-${String(i+1).padStart(2,'0')}`;
                          const val = offres.filter(o=> o.produit===prod && o.statut_offre==='Acceptée' && monthStr(o.date_offre)===mo).reduce((s,o)=> s + (o.prix_usd_kg*o.volume_kg), 0);
                          const tone = val===0 ? 'text-gray-400' : val>50000 ? 'text-green-700' : 'text-amber-700';
                          return <td key={mo} className={`td ${tone}`}>{val? fmtUSD(val,0): '—'}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
