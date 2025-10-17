'use client';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Prospect, Interaction, Offre,
  loadProspects, saveProspects,
  loadOffres, saveOffres,
  resetAll, nextId
} from '../components/storage';

const marches = ['Maroc','GCC','Afrique de l’Ouest','Autres'] as const;
const produits = ['Crevette Vannamei (Équateur)','Crevette Muelleri (Argentine)','Corvina (Amérique du Sud)','Merlu Hubbsi (Argentine)','Jack Mackerel (CL/PE)'] as const;
const statutsProspect = ['À qualifier','Offre envoyée','En négociation','Perdu','Signé'] as const;
const ouiNon = ['Oui','Non'] as const;
const causes = ['Prix','Disponibilité','Délai','Qualité','Conditions','Autre'] as const;
const statutsOffre = ['Envoyée','En négociation','Acceptée','Refusée'] as const;

function fmtUSD(v?: number|null){ if(v==null||isNaN(v)) return '—'; return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(v); }
function todayStr(){ return new Date().toISOString().slice(0,10); }

export default function App(){
  // Onglet actif
  const [tab,setTab] = useState<'dashboard'|'prospects'|'offres'|'historique'>('dashboard');

  // Données
  const [prospects,setProspects]=useState<Prospect[]>([]);
  const [offres,setOffres]=useState<Offre[]>([]);

  // Charger localStorage (aucun échantillon par défaut)
  useEffect(()=>{
    setProspects(loadProspects());
    setOffres(loadOffres());
  },[]);
  useEffect(()=>{ saveProspects(prospects); },[prospects]);
  useEffect(()=>{ saveOffres(offres); },[offres]);

  // Formulaires
  const [pForm,setPForm]=useState<Prospect>({
    id:'', client:'', marche:'Maroc', produit:'Crevette Vannamei (Équateur)',
    dContact: todayStr(), offre:'Non', dOffre:'', montant: undefined,
    statut:'À qualifier', relance: '', reponse:'Non', dReponse:'',
    cause:'', fournisseur:'', dSignature:'', note:''
  });

  const [oForm,setOForm]=useState<Offre>({
    id:'', client:'', marche:'Maroc', produit:'Crevette Vannamei (Équateur)',
    calibre:'', incoterm:'CFR', prix_usd_kg:0, volume_kg:0,
    date_offre: todayStr(), validite_jours:15, statut_offre:'Envoyée', note:''
  });

  // KPI simples
  const offresEnv = prospects.filter(p=>p.offre==='Oui').length;
  const reps = prospects.filter(p=>p.reponse==='Oui').length;
  const signes = prospects.filter(p=>p.statut==='Signé').length;
  const tauxReponse = offresEnv? (reps/offresEnv):0;
  const tauxConv = offresEnv? (signes/offresEnv):0;

  // Relances du jour (prospects)
  const ajd = todayStr();
  const relancesDuJour = useMemo(()=> prospects.filter(p=> p.relance && p.relance<=ajd && !['Signé','Perdu'].includes(p.statut)),[prospects]);

  // Actions
  function addProspect(){
    if(!pForm.client.trim()) return alert('Client / Prospect obligatoire');
    if(pForm.offre==='Oui' && !pForm.dOffre) return alert("Date d'offre requise");
    if(pForm.reponse==='Oui' && !pForm.dReponse) return alert("Date de réponse requise");
    if(pForm.statut==='Signé' && !pForm.dSignature) return alert("Date de signature requise");

    const rec: Prospect = { ...pForm, id: nextId('PR', prospects), montant: pForm.montant ?? null };
    setProspects([rec, ...prospects]);
    setPForm({
      id:'', client:'', marche:'Maroc', produit:'Crevette Vannamei (Équateur)',
      dContact: todayStr(), offre:'Non', dOffre:'', montant: undefined,
      statut:'À qualifier', relance:'', reponse:'Non', dReponse:'',
      cause:'', fournisseur:'', dSignature:'', note:''
    });
    alert('Prospect ajouté ✅');
  }

  function addOffre(){
    if(!oForm.client.trim()) return alert('Client / Prospect obligatoire');
    if(!oForm.prix_usd_kg || oForm.prix_usd_kg<=0) return alert('Prix USD/kg requis (>0)');
    if(!oForm.volume_kg || oForm.volume_kg<=0) return alert('Volume (kg) requis (>0)');

    const rec: Offre = { ...oForm, id: nextId('OF', offres) };
    setOffres([rec, ...offres]);
    setOForm({
      id:'', client:'', marche:'Maroc', produit:'Crevette Vannamei (Équateur)',
      calibre:'', incoterm:'CFR', prix_usd_kg:0, volume_kg:0,
      date_offre: todayStr(), validite_jours:15, statut_offre:'Envoyée', note:''
    });
    alert('Offre enregistrée ✅');
  }

  function resetData(){
    if(confirm('Réinitialiser toutes les données (prospects, offres, historique) ?')) { resetAll(); location.reload(); }
  }

  // UI helpers
  const TabBtn = ({id,label}:{id:any;label:string})=>(
    <button
      className={`px-4 py-2 rounded-xl border ${tab===id?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 hover:bg-gray-50'}`}
      onClick={()=>setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="container py-6 space-y-6">
      {/* Header + actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">CMR Commercial – Eurotrade</h1>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={()=>setTab('prospects')}>+ Ajouter un prospect</button>
          <button className="btn" onClick={()=>setTab('offres')}>+ Enregistrer une offre</button>
          <button className="px-4 py-2 rounded-xl border border-red-300 text-red-700 hover:bg-red-50" onClick={resetData}>Réinitialiser les données</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <TabBtn id="dashboard" label="Dashboard" />
        <TabBtn id="prospects" label="Prospects" />
        <TabBtn id="offres" label="Offres (USD/kg)" />
        <TabBtn id="historique" label="Historique" />
      </div>

      {/* DASHBOARD */}
      {tab==='dashboard' && (
        <div className="space-y-6">
          <div className="card"><div className="card-body text-sm">
            <b>Rappels du jour :</b> {relancesDuJour.length===0 ? 'aucune relance due' : `${relancesDuJour.length} relance(s)`}
          </div></div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card"><div className="card-body"><div className="text-gray-500 text-sm">Taux de réponse</div><div className="text-2xl font-semibold">{(tauxReponse*100).toFixed(0)}%</div></div></div>
            <div className="card"><div className="card-body"><div className="text-gray-500 text-sm">Taux de conversion</div><div className="text-2xl font-semibold">{(tauxConv*100).toFixed(0)}%</div></div></div>
            <div className="card"><div className="card-body"><div className="text-gray-500 text-sm">Prospects actifs</div><div className="text-2xl font-semibold">{prospects.length}</div></div></div>
          </div>

          <div className="card">
            <div className="card-header">Relances à faire aujourd’hui</div>
            <div className="card-body overflow-auto">
              <table className="min-w-full text-sm">
                <thead><tr>{['ID','Client','Marché','Produit','Statut','Prochaine relance'].map(h => <th key={h} className='th'>{h}</th>)}</tr></thead>
                <tbody>
                  {relancesDuJour.map(r => (
                    <tr key={r.id}>
                      <td className='td'>{r.id}</td><td className='td'>{r.client}</td><td className='td'>{r.marche}</td><td className='td'>{r.produit}</td><td className='td'>{r.statut}</td><td className='td font-medium'>{r.relance}</td>
                    </tr>
                  ))}
                  {relancesDuJour.length===0 && <tr><td className='td text-center text-gray-500' colSpan={6}>Aucune relance due.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PROSPECTS */}
      {tab==='prospects' && (
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">Ajouter un prospect</div>
            <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className="text-sm text-gray-600">Client / Prospect</label><input className="input" placeholder="ex: Congelcam" value={pForm.client} onChange={e=>setPForm({...pForm, client:e.target.value})}/></div>
              <div><label className="text-sm text-gray-600">Marché</label><select className="select" value={pForm.marche} onChange={e=>setPForm({...pForm, marche:e.target.value as any})}>{marches.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className="text-sm text-gray-600">Produit</label><select className="select" value={pForm.produit} onChange={e=>setPForm({...pForm, produit:e.target.value as any})}>{produits.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              <div><label className="text-sm text-gray-600" title="Date du 1er contact">Date 1er contact</label><input className="input" type="date" value={pForm.dContact} onChange={e=>setPForm({...pForm, dContact:e.target.value})}/></div>
              <div><label className="text-sm text-gray-600">Offre envoyée ?</label><select className="select" value={pForm.offre} onChange={e=>setPForm({...pForm, offre:e.target.value as any})}>{ouiNon.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
              <div><label className="text-sm text-gray-600">Date offre</label><input className="input" type="date" value={pForm.dOffre} onChange={e=>setPForm({...pForm, dOffre:e.target.value})}/></div>
              <div><label className="text-sm text-gray-600" title="USD HT (optionnel)">Montant (USD)</label><input className="input" type="number" placeholder="ex: 95000" value={(pForm.montant as any)??''} onChange={e=>setPForm({...pForm, montant: e.target.value? Number(e.target.value): undefined})}/></div>
              <div><label className="text-sm text-gray-600">Statut</label><select className="select" value={pForm.statut} onChange={e=>setPForm({...pForm, statut:e.target.value as any})}>{statutsProspect.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className="text-sm text-gray-600">Prochaine relance</label><input className="input" type="date" value={pForm.relance} onChange={e=>setPForm({...pForm, relance:e.target.value})}/></div>
              <div><label className="text-sm text-gray-600">Réponse client ?</label><select className="select" value={pForm.reponse} onChange={e=>setPForm({...pForm, reponse:e.target.value as any})}>{ouiNon.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
              <div><label className="text-sm text-gray-600">Date réponse</label><input className="input" type="date" value={pForm.dReponse} onChange={e=>setPForm({...pForm, dReponse:e.target.value})}/></div>
              <div><label className="text-sm text-gray-600">Cause de perte</label><select className="select" value={pForm.cause} onChange={e=>setPForm({...pForm, cause:e.target.value})}><option value="">—</option>{causes.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            </div>
            <div className="card-body flex justify-end"><button className="btn" onClick={addProspect}>Ajouter</button></div>
          </div>

          <div className="card">
            <div className="card-header">Liste des prospects</div>
            <div className="card-body overflow-auto">
              <table className="min-w-full text-sm">
                <thead><tr>{['ID','Client','Marché','Produit','Statut','Relance'].map(h => <th key={h} className='th'>{h}</th>)}</tr></thead>
                <tbody>
                  {prospects.map(p=>(
                    <tr key={p.id}><td className="td">{p.id}</td><td className="td">{p.client}</td><td className="td">{p.marche}</td><td className="td">{p.produit}</td><td className="td">{p.statut}</td><td className="td">{p.relance||'—'}</td></tr>
                  ))}
                  {prospects.length===0 && <tr><td className="td text-center text-gray-500" colSpan={6}>Aucun prospect pour le moment.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* OFFRES */}
      {tab==='offres' && (
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">Nouvelle offre (USD/kg)</div>
            <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className="text-sm text-gray-600">Client / Prospect</label><input className="input" placeholder="ex: SONAL" value={oForm.client} onChange={e=>setOForm({...oForm, client:e.target.value})}/></div>
              <div><label className="text-sm text-gray-600">Marché</label><select className="select" value={oForm.marche} onChange={e=>setOForm({...oForm, marche:e.target.value as any})}>{marches.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className="text-sm text-gray-600">Produit</label><select className="select" value={oForm.produit} onChange={e=>setOForm({...oForm, produit:e.target.value as any})}>{produits.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              <div><label className="text-sm text-gray-600">Calibre / Format</label><input className="input" placeholder="ex: 20/30 IQF" value={oForm.calibre||''} onChange={e=>setOForm({...oForm, calibre:e.target.value})}/></div>
              <div><label className="text-sm text-gray-600">Incoterm</label><select className="select" value={oForm.incoterm} onChange={e=>setOForm({...oForm, incoterm:e.target.value as any})}>{['FOB','CFR','CIF','EXW'].map(i=><option key={i} value={i}>{i}</option>)}</select></div>
              <div><label className="text-sm text-gray-600">Prix (USD/kg)</label><input className="input" type="number" step="0.01" placeholder="ex: 6.80" value={oForm.prix_usd_kg} onChange={e=>setOForm({...oForm, prix_usd_kg:Number(e.target.value)})}/></div>
              <div><label className="text-sm text-gray-600">Volume (kg)</label><input className="input" type="number" placeholder="ex: 24000" value={oForm.volume_kg} onChange={e=>setOForm({...oForm, volume_kg:Number(e.target.value)})}/></div>
              <div><label className="text-sm text-gray-600">Date offre</label><input className="input" type="date" value={oForm.date_offre} onChange={e=>setOForm({...oForm, date_offre:e.target.value})}/></div>
              <div><label className="text-sm text-gray-600">Validité (jours)</label><input className="input" type="number" value={oForm.validite_jours||''} onChange={e=>setOForm({...oForm, validite_jours:e.target.value?Number(e.target.value):undefined})}/></div>
              <div><label className="text-sm text-gray-600">Statut</label><select className="select" value={oForm.statut_offre} onChange={e=>setOForm({...oForm, statut_offre:e.target.value as any})}>{statutsOffre.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
              <div className="md:col-span-3"><label className="text-sm text-gray-600">Note</label><input className="input" placeholder="Détail des conditions…" value={oForm.note||''} onChange={e=>setOForm({...oForm, note:e.target.value})}/></div>
            </div>
            <div className="card-body flex justify-end"><button className="btn" onClick={addOffre}>Enregistrer l’offre</button></div>
          </div>

          <div className="card">
            <div className="card-header">Historique des offres (USD/kg)</div>
            <div className="card-body overflow-auto">
              <table className="min-w-full text-sm">
                <thead><tr>{['ID','Client','Marché','Produit','Calibre','Incoterm','Prix USD/kg','Volume (kg)','Date','Validité','Statut'].map(h => <th key={h} className='th'>{h}</th>)}</tr></thead>
                <tbody>
                  {offres.map(o=>(
                    <tr key={o.id}>
                      <td className="td">{o.id}</td><td className="td">{o.client}</td><td className="td">{o.marche}</td><td className="td">{o.produit}</td>
                      <td className="td">{o.calibre||'—'}</td><td className="td">{o.incoterm}</td>
                      <td className="td font-medium">{o.prix_usd_kg.toFixed(2)}</td><td className="td">{o.volume_kg.toLocaleString()}</td>
                      <td className="td">{o.date_offre}</td><td className="td">{o.validite_jours||'—'}</td><td className="td">{o.statut_offre}</td>
                    </tr>
                  ))}
                  {offres.length===0 && <tr><td className="td text-center text-gray-500" colSpan={11}>Aucune offre enregistrée.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* HISTORIQUE (placeholder) */}
      {tab==='historique' && (
        <div className="card"><div className="card-body text-sm">
          Le journal des interactions (email, WhatsApp, salon) sera ajouté ici. On peut lier une interaction à un prospect et proposer un bouton “Nouvelle interaction”.
        </div></div>
      )}
    </div>
  );
}
