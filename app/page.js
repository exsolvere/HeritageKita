'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { sb } from '../lib/supabase';

export default function Home() {
  const el = useRef(null);
  const [site, setSite] = useState(null), [threads, setThreads] = useState([]), [user, setUser] = useState(null);
  const [f, setF] = useState({ kind: 'cerita', title: '', body: '' }), [file, setFile] = useState(null), [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: s } = sb.auth.onAuthStateChange((_, ses) => setUser(ses?.user ?? null));
    const map = new maplibregl.Map({ container: el.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: [118, -2.5], zoom: 4 });
    map.addControl(new maplibregl.NavigationControl());
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserLocation: true }));
    fetch('/heritage.json').then(r => r.json()).then(list => list.forEach(h => {
      const d = document.createElement('div'); d.className = 'pin'; d.title = h.name;
      d.onclick = () => { setSite(h); map.flyTo({ center: [h.lng, h.lat], zoom: Math.max(map.getZoom(), 9) }); };
      new maplibregl.Marker({ element: d }).setLngLat([h.lng, h.lat]).addTo(map);
    }));
    return () => { map.remove(); s.subscription.unsubscribe(); };
  }, []);

  const load = async id => { const { data } = await sb.from('threads').select('*').eq('site_id', id).order('created_at', { ascending: false }); setThreads(data || []); };
  useEffect(() => { if (site) load(site.id); }, [site]);

  const post = async e => {
    e.preventDefault(); setBusy(true);
    let image_url = null;
    if (file) {
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.]/g, '_')}`;
      const { error } = await sb.storage.from('photos').upload(path, file);
      if (error) { alert(error.message); setBusy(false); return; }
      image_url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
    }
    const { error } = await sb.from('threads').insert({ site_id: site.id, ...f, image_url, author_name: user.user_metadata?.full_name || user.email });
    if (error) alert(error.message);
    setF({ kind: 'cerita', title: '', body: '' }); setFile(null); setBusy(false); load(site.id);
  };

  return (
    <div className="app">
      <div id="map" ref={el} />
      <aside className="side">
        <div className="top">
          <b>Pusaka Warga</b>
          {user ? <button onClick={() => sb.auth.signOut()}>Keluar</button>
            : <button onClick={() => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } })}>Masuk dengan Google</button>}
        </div>
        {!site ? <p>Klik pin di peta untuk melihat dan membuat thread tentang situs heritage.</p> : <>
          <h2>{site.name}</h2>
          {user ? <form onSubmit={post}>
            <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
              <option value="cerita">Cerita</option><option value="foto">Foto</option><option value="kerusakan">Laporan kerusakan</option><option value="tanya">Tanya</option>
            </select>
            <input required placeholder="Judul" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
            <textarea rows={3} placeholder="Isi thread" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files[0])} />
            <button disabled={busy}>{busy ? 'Mengirim…' : 'Posting'}</button>
          </form> : <p className="m">Masuk dulu untuk membuat thread.</p>}
          {threads.map(t => <div className="t" key={t.id}>
            <span className="k">{t.kind}</span> <b>{t.title}</b>
            {t.image_url && <img src={t.image_url} alt={t.title} />}
            <p>{t.body}</p>
            <div className="m">{t.author_name} · {new Date(t.created_at).toLocaleDateString('id-ID')}</div>
          </div>)}
          {!threads.length && <p className="m">Belum ada thread. Jadi yang pertama!</p>}
        </>}
      </aside>
    </div>
  );
}
