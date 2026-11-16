import fs from 'fs';
const q = `SELECT ?i ?iLabel ?c WHERE { ?i wdt:P17 wd:Q252; wdt:P1435 ?d; wdt:P625 ?c. SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en". } } LIMIT 5000`;
const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { 'User-Agent': 'heritage-crowd/1.0', Accept: 'application/sparql-results+json' } });
const j = await r.json(); const seen = new Map();
for (const b of j.results.bindings) {
  const id = b.i.value.split('/').pop(); const m = b.c.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
  if (m && !seen.has(id) && !/^Q\d+$/.test(b.iLabel.value)) seen.set(id, { id, name: b.iLabel.value, lat: +m[2], lng: +m[1] });
}
fs.writeFileSync('public/heritage.json', JSON.stringify([...seen.values()]));
console.log(seen.size, 'situs heritage disimpan');
