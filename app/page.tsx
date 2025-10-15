'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Prospect, Interaction, loadProspects, saveProspects, loadInteractions, saveInteractions } from '@/components/storage';

const marches = ['Maroc','GCC','Afrique de l’Ouest','Autres'] as const;
const produits = ['Crevette Vannamei (Équateur)','Crevette Muelleri (Argentine)','Corvina (Amérique du Sud)','Merlu Hubbsi (Argentine)','Jack Mackerel (CL/PE)'] as const;
const statuts = ['À qualifier','Offre envoyée','En négociation','Perdu','Signé'] as const;
const ouiNon = ['Oui','Non'] as const;
const causes = ['Prix','Disponibilité','Délai','Qualité','Conditions','Autre'] as const;

function fmtUSD(v?: number|null){ if(v==null||isNaN(v)) return '—'; return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v); }
function todayStr(){ const d=new Date(); return d.toISOString().slice(0,10); }
function addDays(s: string, n:number){ const d=new Date(s); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function monthStr(s:string){ const d=new Date(s); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

export default function Page(){
  const [prospects,setProspects] = useState<Prospect[]>([]);
  const [ready,setReady] = useState(false);

  useEffect(()=>{
    const p = loadProspects();
    if(p.length===0){
      const sample: Prospect[] = [
        { id:'PR-000001', client:'Congelcam', marche:'Afrique de l’Ouest', produit:'Crevette Vannamei (Équateur)', dContact:'2025-09-19', offre:'Oui', dOffre:'2025-09-22', montant:185000, statut:'En négociation', relance:'2025-10-16', reponse:'Non', dReponse:'', cause:'', fournisseur:'Proveedor A', dSignature:'', note:'Attendre décision' },
        { id:'PR-000002', client:'SONAL', marche:'Afrique de l’Ouest', produit:'Crevette Vannamei (Équateur)', dContact:'2025-09-25', offre:'Oui', dOffre:'2025-09-26', montant:92000, statut:'Offre envoyée', relance:'2025-10-15', reponse:'Non', dReponse:'', cause:'', fournisseur:'Proveedor B', dSignature:'', note:'' },
        { id:'PR-000003', client:'AlMaya', marche:'GCC', produit:'Crevette Vannamei (Équateur)', dContact:'2025-08-30', offre:'Oui', dOffre:'2025-08-31', montant:130000, statut:'Perdu', relance:'2025-09-15', reponse:'Oui', dReponse:'2025-09-05', cause:'Prix', fournisseur:'Proveedor C', dSignature:'', note:'Concurrent moins cher' },
        { id:'PR-000004', client:'Marjane', marche:'Maroc', produit:'Crevette Vannamei (Équateur)', dContact:'2025-09-29', offre:'Non', dOffre:'', montant:null, statut:'À qualifier', relance:'2025-10-18', reponse:'Non', dReponse:'', cause:'', fournisseur:'', dSignature:'', note:'' },
        { id:'PR-000005', client:'Carrefour MA', marche:'Maroc', produit:'Merlu Hubbsi (Argentine)', dContact:'2025-08-25', offre:'Oui', dOffre:'2025-08-26', montant:67000, statut:'Signé', relance:'2025-09-10', reponse:'Oui', dReponse:'2025-08-27', cause:'', fournisseur:'Proveedor D', dSignature:'2025-09-05', note:'OK' },
      ];
      setProspects(sample); saveProspects(sample);
    } else setProspects(p);
    setReady(true);
  },[]);

  useEffect(()=>{ if(ready) saveProspects(prospects); },[prospects,ready]);

  const [form,setForm] = useState<Prospect>({
    id:'', client:'', marche:'Maroc', produit:'Crevette Vannamei (Équateur)',
    dContact: todayStr(), offre:'Non', dOffre:'', montant: undefined,
    statut:'À qualifier', relance: addDays(todayStr(), 3), reponse:'Non', dReponse:'',
    cause:'', fournisseur:'', dSignature:'', note:''
  });

  const nextId = useMemo(()=>{
    const max = prospects.reduce((m,p)=> Math.max(m, parseInt(p.id.split('-')[1] or '0')), 0);
    return `PR-${String(max+1).padStart(6,'0')}`;
  },[prospects]);

  function addProspect(){
    if(!form.client.trim()) return alert('Client obligatoire');
    if(form.offre==='Oui' && !form.dOffre) return alert('Date offre requise');
    if(form.reponse==='Oui' && !form.dReponse) return alert('Date réponse requise');
    if(form.statut==='Signé' && !form.dSignature) return alert('Date signature requise');
    const rec: Prospect = { ...form, id: nextId, montant: form.montant ?? null };
    setProspects([rec, ...prospects]);
    setForm({ id:'', client:'', marche:'Maroc', produit:'Crevette Vannamei (Équateur)', dContact: todayStr(), offre:'Non', dOffre:'', montant: undefined, statut:'À qualifier', relance: addDays(todayStr(),7), reponse:'Non', dReponse:'', cause:'', fournisseur:'', dSignature:'', note:'' });
  }

  const aujourd = todayStr();
  const relancesDuJour = useMemo(()=> prospects.filter(p=> p.relance && p.relance<=aujourd && !['Signé','Perdu'].includes(p.statut)),[prospects]);
  const enRetard = useMemo(()=> prospects.filter(p=> p.relance && p.relance<aujourd && !['Signé','Perdu'].includes(p.statut)),[prospects]);

  const perfClients = useMemo(()=>{
    const map = new Map<string, {client:string; offres:number; reponses:number; signes:number; montant:number}>();
    for(const p of prospects){
      const k = p.client; if(!map.has(k)) map.set(k,{client:k, offres:0,reponses:0,signes:0,montant:0});
      const x = map.get(k)!;
      if(p.offre==='Oui') x.offres++;
      if(p.reponse==='Oui') x.reponses++;
      if(p.statut==='Signé'){ x.signes++; x.montant += (p.montant||0); }
    }
    return Array.from(map.values()).sort((a,b)=> b.montant - a.montant);
  },[prospects]);

  const ventesSerie = useMemo(()=>{
    const acc: Record<string, number> = {};
    for(const p of prospects){
      if(p.statut==='Signé' && p.dSignature){
        const m = monthStr(p.dSignature);
        acc[m] = (acc[m]||0) + (p.montant||0);
      }
    }
    return Object.entries(acc).sort(([a],[b])=> a.localeCompare(b)).map(([mois,usd])=>({mois,usd}));
  },[prospects]);

  const causesSerie = useMemo(()=>{
    const acc: Record<string, number> = {Prix:0,Disponibilité:0,'Délai':0,Qualité:0,Conditions:0,Autre:0};
    for(const p of prospects){ if(p.cause && acc[p.cause]!=null) acc[p.cause]++; }
    return Object.entries(acc).map(([cause,n])=>({cause,n}));
  },[prospects]);

  const offres = prospects.filter(p=> p.offre==='Oui').length;
  const reps = prospects.filter(p=> p.reponse==='Oui').length;
  const signes = prospects.filter(p=> p.statut==='Signé').length;
  const tauxReponse = offres? reps/offres:0;
  const tauxConv = offres? signes/offres:0;

  return (
    <main>
      <div className="container py-6 space-y-6">
        <div className="card"><div className="card-body text-sm">
          <b>Rappels du jour :</b> {relancesDuJour.length===0 ? 'aucune relance due' : `${relancesDuJour.length} relance(s)`}
          {enRetard.length>0 && <> — <span className="text-red-600">{enRetard.length} en retard</span></>}
        </div></div>

        <div className="card">
          <div className="card-header">Ajouter un prospect / une offre</div>
          <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="input" placeholder="Client / Prospect" value={form.client} onChange={e=>setForm({...form, client:e.target.value})}/>
            <select className="select" value={form.marche} onChange={e=>setForm({...form, marche:e.target.value as any})}>{marches.map(m => <option key={m} value={m}>{m}</option>)}</select>
            <select className="select" value={form.produit} onChange={e=>setForm({...form, produit:e.target.value as any})}>{produits.map(p => <option key={p} value={p}>{p}</option>)}</select>
            <input className="input" type="date" value={form.dContact} onChange={e=>setForm({...form, dContact:e.target.value})}/>
            <select className="select" value={form.offre} onChange={e=>setForm({...form, offre:e.target.value as any})}>{ouiNon.map(x => <option key={x} value={x}>{x}</option>)}</select>
            <input className="input" type="date" placeholder="Date offre" value={form.dOffre} onChange={e=>setForm({...form, dOffre:e.target.value})}/>
            <input className="input" type="number" placeholder="Montant USD (HT)" value={(form.montant as any)??''} onChange={e=>setForm({...form, montant: e.target.value? Number(e.target.value): undefined})}/>
            <select className="select" value={form.statut} onChange={e=>setForm({...form, statut:e.target.value as any})}>{statuts.map(s => <option key={s} value={s}>{s}</option>)}</select>
            <input className="input" type="date" value={form.relance} onChange={e=>setForm({...form, relance:e.target.value})}/>
            <select className="select" value={form.reponse} onChange={e=>setForm({...form, reponse:e.target.value as any})}>{ouiNon.map(x => <option key={x} value={x}>{x}</option>)}</select>
            <input className="input" type="date" placeholder="Date réponse" value={form.dReponse} onChange={e=>setForm({...form, dReponse:e.target.value})}/>
            <select className="select" value={form.cause} onChange={e=>setForm({...form, cause:e.target.value})}>
              <option value="">Cause de perte (optionnel)</option>
              {causes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" placeholder="Fournisseur" value={form.fournisseur} onChange={e=>setForm({...form, fournisseur:e.target.value})}/>
            <input className="input" type="date" placeholder="Date signature" value={form.dSignature} onChange={e=>setForm({...form, dSignature:e.target.value})}/>
          </div>
          <div className="card-body flex justify-end"><button className="btn" onClick={addProspect}>Ajouter</button></div>
        </div>

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

        <div className="card">
          <div className="card-header">Performance par client</div>
          <div className="card-body overflow-auto">
            <table className="min-w-full text-sm">
              <thead><tr>{['Client','Offres','Réponses','Signés','Ventes USD'].map(h => <th key={h} className='th'>{h}</th>)}</tr></thead>
              <tbody>
                {Array.from(new Map(prospects.map(p=>[p.client,p])).keys()).length===0 && <tr><td className='td' colSpan={5}>—</td></tr>}
                {Array.from(new Map(prospects.map(p=>[p.client,p])).keys()).length>0 && (()=>{
                  const map = new Map<string, {client:string; offres:number; reponses:number; signes:number; montant:number}>();
                  for(const p of prospects){
                    const k = p.client; if(!map.has(k)) map.set(k,{client:k,offres:0,reponses:0,signes:0,montant:0});
                    const x = map.get(k)!;
                    if(p.offre==='Oui') x.offres++;
                    if(p.reponse==='Oui') x.reponses++;
                    if(p.statut==='Signé'){ x.signes++; x.montant += (p.montant||0); }
                  }
                  const arr = Array.from(map.values()).sort((a,b)=> b.montant-a.montant);
                  return arr.map(c => (<tr key={c.client}><td className='td'>{c.client}</td><td className='td'>{c.offres}</td><td className='td'>{c.reponses}</td><td className='td'>{c.signes}</td><td className='td font-medium'>{fmtUSD(c.montant)}</td></tr>));
                })()}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card"><div className="card-header">Ventes signées USD / mois</div><div className="card-body h-64">
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={(() => {
                const acc: Record<string, number> = {};
                for(const p of prospects){ if(p.statut==='Signé' && p.dSignature){ const m=monthStr(p.dSignature); acc[m]=(acc[m]||0)+(p.montant||0);} }
                return Object.entries(acc).sort(([a],[b])=>a.localeCompare(b)).map(([mois,usd])=>({mois,usd}));
              })()}><XAxis dataKey='mois'/><YAxis/><Tooltip/><Bar dataKey='usd' /></BarChart>
            </ResponsiveContainer>
          </div></div>
          <div className="card"><div className="card-header">Causes de perte</div><div className="card-body h-64">
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={(() => {
                const acc: Record<string, number> = {Prix:0,Disponibilité:0,'Délai':0,Qualité:0,Conditions:0,Autre:0};
                for(const p of prospects){ if(p.cause && acc[p.cause]!=null) acc[p.cause]++; }
                return Object.entries(acc).map(([cause,n])=>({cause,n}));
              })()}><XAxis dataKey='cause'/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey='n' /></BarChart>
            </ResponsiveContainer>
          </div></div>
        </div>

      </div>
    </main>
  );
}
