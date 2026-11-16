'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { sb } from '../lib/supabase';

const KIND = { cerita: 'Cerita', foto: 'Foto', kerusakan: 'Kerusakan', tanya: 'Tanya' };
const ST = { belum: 'Belum diverifikasi', terverifikasi: '✓ Terverifikasi', ditolak: 'Ditolak' };
const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 3600 ? `${Math.max(1, ~~(s / 60))} mnt` : s < 86400 ? `${~~(s / 3600)} jam` : `${~~(s / 86400)} hari`; };

const shrink = f => new Promise(res => { const i = new Image(); i.onload = () => { const k = Math.min(1, 1600 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = i.width * k; c.height = i.height * k; c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); c.toBlob(b => res(b || f), 'image/jpeg', 0.82); }; i.onerror = () => res(f); i.src = URL.createObjectURL(f); });

export default function Home() {
  const el = useRef(null), map = useRef(null);
  const [sites, setSites] = useState([]), [site, setSite] = useState(null), [q, setQ] = useState('');
  const [user, setUser] = useState(null), [mod, setMod] = useState(false);
  const [threads, setThreads] = useState([]), [mine, setMine] = useState(new Set()), [sort, setSort] = useState('hot');
  const [open, setOpen] = useState(null), [cms, setCms] = useState([]), [cbody, setCbody] = useState('');
  const [form, setForm] = useState(false), [f, setF] = useState({ kind: 'cerita', title: '', body: '' }), [files, setFiles] = useState([]), [cmine, setCmine] = useState(new Set()), [reply, setReply] = useState(null), [rbody, setRbody] = useState(''), [lb, setLb] = useState(null), [busy, setBusy] = useState(false);
  const name = u => u.user_metadata?.full_name || u.email;
  const siteName = id => sites.find(s => s.id === id)?.name || id;

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: s } = sb.auth.onAuthStateChange((_, ses) => setUser(ses?.user ?? null));
    const m = (map.current = new maplibregl.Map({ container: el.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: [118, -2.5], zoom: 4 }));
    m.addControl(new maplibregl.NavigationControl(), 'top-left');
    m.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserLocation: true }));
    fetch('/heritage.json').then(r => r.json()).then(list => {
      setSites(list);
      list.forEach(h => {
        const d = document.createElement('div'); d.className = 'pin'; d.title = h.name;
        d.onclick = () => { setSite(h); setOpen(null); };
        new maplibregl.Marker({ element: d }).setLngLat([h.lng, h.lat]).addTo(m);
      });
    });
    return () => { m.remove(); s.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) { setMod(false); return; }
    sb.from('mods').select('user_id').eq('user_id', user.id).then(({ data }) => setMod(!!data?.length));
  }, [user]);

  useEffect(() => { if (site) map.current?.flyTo({ center: [site.lng, site.lat], zoom: Math.max(map.current.getZoom(), 9) }); }, [site]);

  const load = useCallback(async () => {
    let r = sb.from('threads').select('*,votes(count),comments(count)').order('created_at', { ascending: false }).limit(100);
    if (site) r = r.eq('site_id', site.id);
    const { data } = await r;
    const t = (data || []).map(x => ({ ...x, score: x.votes[0].count, nc: x.comments[0].count }));
    setThreads(t); setOpen(o => o && t.find(x => x.id === o.id));
    if (user) { const { data: v } = await sb.from('votes').select('thread_id').eq('user_id', user.id); setMine(new Set((v || []).map(x => x.thread_id))); } else setMine(new Set());
  }, [site, user]);
  useEffect(() => { load(); }, [load]);

  const loadCms = async id => {
    const { data } = await sb.from('comments').select('*,comment_votes(count)').eq('thread_id', id).order('created_at');
    setCms((data || []).map(c => ({ ...c, score: c.comment_votes[0].count })));
    if (user) { const { data: v } = await sb.from('comment_votes').select('comment_id').eq('user_id', user.id); setCmine(new Set((v || []).map(x => x.comment_id))); }
  };
  useEffect(() => { if (open) loadCms(open.id); }, [open?.id]);

  const login = () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  const need = fn => (...a) => (user ? fn(...a) : login());

  const vote = need(async t => {
    if (mine.has(t.id)) await sb.from('votes').delete().eq('thread_id', t.id).eq('user_id', user.id);
    else await sb.from('votes').insert({ thread_id: t.id });
    load();
  });
  const setStatus = async (t, status) => { await sb.from('threads').update({ status }).eq('id', t.id); load(); };
  const del = async t => { if (confirm('Hapus thread ini?')) { await sb.from('threads').delete().eq('id', t.id); setOpen(null); load(); } };
  const sendCm = need(async (body, parent_id) => { await sb.from('comments').insert({ thread_id: open.id, body, parent_id, author_name: name(user) }); loadCms(open.id); load(); });
  const comment = e => { e.preventDefault(); if (cbody.trim()) { sendCm(cbody, null); setCbody(''); } };
  const delCm = async c => { await sb.from('comments').delete().eq('id', c.id); loadCms(open.id); load(); };
  const voteCm = need(async c => { if (cmine.has(c.id)) await sb.from('comment_votes').delete().eq('comment_id', c.id).eq('user_id', user.id); else await sb.from('comment_votes').insert({ comment_id: c.id }); loadCms(open.id); });
  const post = async e => {
    e.preventDefault(); setBusy(true); const images = [];
    for (const [i, file] of files.entries()) {
      const path = `${user.id}/${Date.now()}-${i}.jpg`;
      const { error } = await sb.storage.from('photos').upload(path, await shrink(file), { contentType: 'image/jpeg' });
      if (error) { alert(error.message); setBusy(false); return; }
      images.push(sb.storage.from('photos').getPublicUrl(path).data.publicUrl);
    }
    const { error } = await sb.from('threads').insert({ site_id: site.id, ...f, images, author_name: name(user) });
    if (error) alert(error.message);
    else { setF({ kind: 'cerita', title: '', body: '' }); setFiles([]); setForm(false); load(); }
    setBusy(false);
  };

  const kids = p => cms.filter(c => c.parent_id === p).sort((a, b) => b.score - a.score || new Date(a.created_at) - new Date(b.created_at));
  const cm = c => (
    <div className="cm" key={c.id}>
      <div className="m"><b>{c.author_name}</b> · {ago(c.created_at)}</div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
      <div className="m">
        <button className={'g' + (cmine.has(c.id) ? ' on' : '')} onClick={() => voteCm(c)}>▲ {c.score}</button>
        <button className="g" onClick={() => need(setReply)(reply === c.id ? null : c.id)}>Balas</button>
        {(mod || user?.id === c.author_id) && <button className="g" onClick={() => delCm(c)}>Hapus</button>}
      </div>
      {reply === c.id && <form className="n" onSubmit={e => { e.preventDefault(); if (rbody.trim()) sendCm(rbody, c.id); setRbody(''); setReply(null); }}>
        <textarea autoFocus rows={2} value={rbody} onChange={e => setRbody(e.target.value)} /><div><button>Kirim</button></div></form>}
      {kids(c.id).map(cm)}
    </div>
  );
  const list = [...threads].sort((a, b) => sort === 'hot' ? b.score - a.score || new Date(b.created_at) - new Date(a.created_at) : 0);
  const hits = q ? sites.filter(s => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];

  const Card = ({ t, full }) => (
    <div className="card">
      <div className="v">
        <button className={mine.has(t.id) ? 'on' : ''} onClick={() => vote(t)}>▲</button>{t.score}
      </div>
      <div className="b">
        <div className="m">
          <span className="f">{KIND[t.kind]}</span>
          {t.status !== 'belum' && <span className={'f ' + t.status}>{ST[t.status]}</span>}
          <span className="link" onClick={() => { const s = sites.find(x => x.id === t.site_id); if (s) { setSite(s); setOpen(null); } }}>{siteName(t.site_id)}</span>
          <span>· {t.author_name} · {ago(t.created_at)}</span>
        </div>
        <h3 style={{ cursor: full ? 'default' : 'pointer' }} onClick={() => !full && setOpen(t)}>{t.title}</h3>
        {t.body && <p>{full ? t.body : t.body.slice(0, 200)}</p>}
        {t.images?.length > 0 && <div className={'ig n' + Math.min(t.images.length, 2)}>{t.images.map(u => <img key={u} src={u} alt="" onClick={() => full ? setLb(u) : setOpen(t)} />)}</div>}
        <div className="m" style={{ marginTop: 6 }}>
          <button className="g" onClick={() => setOpen(t)}>💬 {t.nc} komentar</button>
          {(mod || user?.id === t.author_id) && <button className="g" onClick={() => del(t)}>Hapus</button>}
          {mod && ['terverifikasi', 'ditolak', 'belum'].filter(s => s !== t.status).map(s =>
            <button key={s} className="g" onClick={() => setStatus(t, s)}>{s === 'belum' ? 'Reset' : s === 'terverifikasi' ? '✓ Verifikasi' : '✕ Tolak'}</button>)}
        </div>
      </div>
    </div>
  );

  return (<>
    <header>
      <span className="logo" onClick={() => { setSite(null); setOpen(null); }}>HeritageKita</span>
      <div className="sw">
        <input placeholder="Cari situs heritage" value={q} onChange={e => setQ(e.target.value)} />
        {hits.length > 0 && <div className="dd">{hits.map(s => <div key={s.id} onClick={() => { setSite(s); setOpen(null); setQ(''); }}>{s.name}</div>)}</div>}
      </div>
      {user ? <><span className="m">{mod && '🛡 Mod · '}{name(user)}</span><button className="g" onClick={() => sb.auth.signOut()}>Keluar</button></> : <button onClick={login}>Masuk</button>}
    </header>
    <main>
      <div id="map" ref={el} />
      <section className="feed">
        {open ? <>
          <button className="g" onClick={() => setOpen(null)}>← Kembali</button>
          <Card t={open} full />
          <form className="n" onSubmit={need(comment)}>
            <textarea rows={2} placeholder={user ? 'Tulis komentar' : 'Masuk untuk berkomentar'} value={cbody} onChange={e => setCbody(e.target.value)} />
            <div><button disabled={!cbody.trim()}>Kirim</button></div>
          </form>
          {kids(null).map(cm)}
        </> : <>
          <div className="bar">
            <h2>{site ? site.name : 'Semua situs'}</h2>
            <div className="tabs"><button className={sort === 'hot' ? 'on' : ''} onClick={() => setSort('hot')}>Populer</button><button className={sort === 'new' ? 'on' : ''} onClick={() => setSort('new')}>Baru</button></div>
            {site && <button onClick={need(() => setForm(!form))}>+ Thread</button>}
          </div>
          {!site && <p className="m">Pilih pin di peta untuk membuat thread di situs itu.</p>}
          {form && site && <form className="n" onSubmit={post}>
            <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input required placeholder="Judul" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
            <textarea rows={4} placeholder="Isi (opsional)" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
            <input type="file" accept="image/*" multiple onChange={e => setFiles([...e.target.files].slice(0, 4))} />
            <div className="m">Foto maks. 4{files.length ? ` · ${files.length} dipilih` : ''}</div>
            <div><button disabled={busy}>{busy ? 'Mengirim…' : 'Posting'}</button></div>
          </form>}
          {list.map(t => <Card key={t.id} t={t} />)}
          {!list.length && <p className="m">Belum ada thread.</p>}
        </>}
      </section>
    </main>
    {lb && <div className="lb" onClick={() => setLb(null)}><img src={lb} alt="" /></div>}
  </>);
}
