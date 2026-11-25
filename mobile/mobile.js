'use strict';
/*
 * Wetter-App – Smartphone-Version (PWA)
 * Datenquellen wie am Desktop: DWD über Bright Sky und Open-Meteo, Copernicus CAMS, EUMETSAT; Suche über Photon (OSM).
 * Diese Datei stellt auch die Hilfsfunktionen bereit, die das gemeinsame Kartenmodul ../map.js erwartet.
 */

/* ======================= Hilfsfunktionen (auch für map.js) ======================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const q = o => new URLSearchParams(o).toString();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MIN = 60 * 1000;
const de = 'de-DE';
const fmtTime = d => new Date(d).toLocaleTimeString(de, { hour: '2-digit', minute: '2-digit' });
const fmtWdTime = d => new Date(d).toLocaleString(de, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const r0 = v => v == null || isNaN(v) ? '–' : (Math.round(v) || 0).toLocaleString(de);
const r1 = v => v == null || isNaN(v) ? '–' : ((Math.round(v * 10) / 10) || 0).toLocaleString(de, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const r2 = v => v == null || isNaN(v) ? '–' : (Math.round(v * 100) / 100).toLocaleString(de, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const deg = v => v == null ? '–' : `${r0(v)}°`;
const DIRS = ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'];
const dirName = d => d == null ? '' : DIRS[Math.round(d / 45) % 8];
const titleCase = s => !s ? '' : (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s);
// DWD kürzt Stationsnamen auf 20 Zeichen, z. B. „JUELICH (KLAERANLAGE“ – fehlende Klammer ergänzen
const stationName = s => { const t = titleCase(s); return (t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length ? `${t})` : t; };
function relMin(t) {
  const m = Math.round((t - Date.now()) / MIN);
  if (Math.abs(m) < 3) return 'jetzt';
  if (Math.abs(m) < 120) return m > 0 ? `in ${m} Min.` : `vor ${-m} Min.`;
  const h = Math.round(m / 60);
  return h > 0 ? `in ${h} Std.` : `vor ${-h} Std.`;
}
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); if (ms) t._h = setTimeout(() => { t.hidden = true; }, ms);
}

// Emoji-Symbole: nur für die Städte-Symbole des gemeinsamen Kartenmoduls
const WMO_EMOJI = {
  0: ['☀️', '🌙'], 1: ['🌤️', '🌙'], 2: ['⛅', '☁️'], 3: ['☁️', '☁️'], 45: ['🌫️', '🌫️'], 48: ['🌫️', '🌫️'],
  51: ['🌦️', '🌧️'], 53: ['🌧️', '🌧️'], 55: ['🌧️', '🌧️'], 56: ['🌧️', '🌧️'], 57: ['🌧️', '🌧️'], 61: ['🌦️', '🌧️'], 63: ['🌧️', '🌧️'], 65: ['🌧️', '🌧️'],
  66: ['🌧️', '🌧️'], 67: ['🌧️', '🌧️'], 71: ['🌨️', '🌨️'], 73: ['🌨️', '🌨️'], 75: ['❄️', '❄️'], 77: ['🌨️', '🌨️'], 80: ['🌦️', '🌧️'], 81: ['🌧️', '🌧️'],
  82: ['⛈️', '⛈️'], 85: ['🌨️', '🌨️'], 86: ['❄️', '❄️'], 95: ['⛈️', '⛈️'], 96: ['⛈️', '⛈️'], 99: ['⛈️', '⛈️'],
};
const WMO_TEXT = {
  0: 'Klar', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bedeckt', 45: 'Nebel', 48: 'Reifnebel',
  51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen', 56: 'Gefrierender Niesel', 57: 'Gefrierender Niesel',
  61: 'Leichter Regen', 63: 'Regen', 65: 'Starker Regen', 66: 'Gefrierender Regen', 67: 'Gefrierender Regen',
  71: 'Leichter Schneefall', 73: 'Schneefall', 75: 'Starker Schneefall', 77: 'Schneegriesel',
  80: 'Leichte Schauer', 81: 'Regenschauer', 82: 'Heftige Schauer', 85: 'Schneeschauer', 86: 'Starke Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Schweres Gewitter',
};
function wmo(code, isDay = 1) { const e = WMO_EMOJI[code] || ['🌡️', '🌡️']; return [isDay ? e[0] : e[1], WMO_TEXT[code] || '']; }

/* ======================= Wettersymbole (SVG, Entwurf A) ======================= */
function wxKind(code, isDay = 1) {
  if (code == null) return 'cloud';
  if (code <= 1) return isDay ? 'sun' : 'moon';
  if (code === 2) return isDay ? 'partly' : 'partlyNight';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloud';
}
const BS_TEXT = { 'clear-day': 'Klar', 'clear-night': 'Klar', 'partly-cloudy-day': 'Teilweise bewölkt', 'partly-cloudy-night': 'Teilweise bewölkt',
  cloudy: 'Bewölkt', fog: 'Nebel', wind: 'Windig', rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee', hail: 'Hagel', thunderstorm: 'Gewitter' };
const BS_KIND = { 'clear-day': 'sun', 'clear-night': 'moon', 'partly-cloudy-day': 'partly', 'partly-cloudy-night': 'partlyNight', cloudy: 'cloud', fog: 'fog', wind: 'cloud', rain: 'rain', sleet: 'snow', snow: 'snow', hail: 'rain', thunderstorm: 'thunder' };
const CLOUD = 'M17.5 19H8a5 5 0 1 1 .9-9.9A6 6 0 0 1 20 11.5a3.75 3.75 0 0 1-2.5 7.5z';
const CLOUD_S = 'M17.5 15H8a4.5 4.5 0 1 1 .8-8.9A5.5 5.5 0 0 1 19.5 8a3.5 3.5 0 0 1-2 7z';
function icon(kind, cls = 'ico', label = '') {
  const a = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  const S = '#f6c343', C = '#c9d4e3';
  const body = {
    sun: `<circle cx="12" cy="12" r="4" stroke="${S}"/><path stroke="${S}" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
    moon: `<path stroke="${C}" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>`,
    partly: `<path stroke="${S}" d="M8 2.5v1.5M2.5 8H4M4.1 4.1l1 1M11.9 4.1l-1 1"/><path stroke="${S}" d="M5.2 11.3a3.5 3.5 0 1 1 6.3-3.6"/><path stroke="${C}" d="M17 20H9a4 4 0 1 1 .8-7.9 5 5 0 0 1 9.5 1.9A3 3 0 0 1 17 20z"/>`,
    partlyNight: `<path stroke="${C}" d="M11 3.5a4.2 4.2 0 0 0 4.6 4.6A4.6 4.6 0 1 1 11 3.5z" opacity=".8"/><path stroke="${C}" d="M17 20H9a4 4 0 1 1 .8-7.9 5 5 0 0 1 9.5 1.9A3 3 0 0 1 17 20z"/>`,
    cloud: `<path stroke="${C}" d="${CLOUD}"/>`,
    fog: `<path stroke="${C}" d="M5 8h14M3 12h18M6 16h12M8 20h8"/>`,
    drizzle: `<path stroke="${C}" d="${CLOUD_S}"/><path stroke="#6aa8ff" d="M9 18v1M13 19v1M17 18v1"/>`,
    rain: `<path stroke="${C}" d="${CLOUD_S}"/><path stroke="#6aa8ff" d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>`,
    snow: `<path stroke="${C}" d="${CLOUD_S}"/><path stroke="#f2a7da" stroke-width="3" d="M8 19h.01M12 21h.01M16 19h.01"/>`,
    thunder: `<path stroke="${C}" d="${CLOUD_S}"/><path stroke="${S}" d="M13 14l-3 4h4l-3 4"/>`,
  }[kind] || `<path stroke="${C}" d="${CLOUD}"/>`;
  return `<svg class="${cls}" viewBox="0 0 24 24" stroke-width="1.8" ${a}>${body}</svg>`;
}
const ICO = {
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  starFill: '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  arrow: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true" style="stroke:#f6c343"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  drop: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>',
  gauge: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 13l3.5-4"/>',
};
const windArrow = (dirDeg, label, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" role="img" aria-label="${esc(label)}" style="transform:rotate(${dirDeg ?? 0}deg)">${ICO.arrow}</svg>`;

/* ======================= Konfiguration ======================= */
const CFG_KEY = 'wetterapp.mobile.v1';
function loadCfg() {
  try {
    const own = JSON.parse(localStorage.getItem(CFG_KEY));
    if (own) return own;
    // Erster Start: Einstellungen der bisherigen Desktop-App übernehmen (Zuhause, Standort-Methode, PV-Flächen)
    const old = JSON.parse(localStorage.getItem('wetterapp.config.v1'));
    if (!old) return {};
    const c = old.current || {};
    return {
      home: old.home || null,
      current: { mode: c.mode === 'auto' ? 'gps' : (c.mode || 'gps'), name: c.name ?? null, lat: c.lat ?? null, lon: c.lon ?? null },
      active: { type: old.active === 'home' ? 'home' : 'current' },
      pv: { planes: old.pv?.planes || [] },
      mapLayers: old.mapLayers || null,
    };
  } catch { return {}; }
}
const config = Object.assign({
  home: null,                                              // {name, lat, lon}
  current: { mode: 'gps', name: null, lat: null, lon: null },  // gps | ip | manual
  favs: [],                                                // [{id, name, region, lat, lon}]
  active: { type: 'current' },                             // {type:'current'|'home'|'fav', id}
  pv: { planes: [] },                                      // [{name, kwp, tilt, azimuth, limit}]
  mapLayers: null,
  showMine: true,
}, loadCfg());
function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(config)); } catch { /* egal */ } }
const isDark = () => true;   // Entwurf A ist dunkel

const state = { geo: null, geoName: null, geoError: null, data: null, loadSeq: 0, loadedAt: 0, view: 'wetter',
  summary: new Map(), summaryAt: 0, homeData: null, homeAt: 0, pv: null, favEditing: false };

/* ======================= Orte ======================= */
function currentLoc() {
  const c = config.current;
  if (c.mode === 'manual' && c.lat != null) return { key: 'current', name: c.name, lat: c.lat, lon: c.lon };
  if (c.mode !== 'manual' && state.geo) return { key: 'current', name: state.geoName || 'Mein Standort', lat: state.geo.lat, lon: state.geo.lon };
  return null;
}
const homeLoc = () => config.home ? { key: 'home', ...config.home } : null;
const favLoc = id => { const f = config.favs.find(x => x.id === id); return f ? { key: `fav:${f.id}`, ...f } : null; };
function activeLoc() {
  const a = config.active;
  if (a.type === 'home' && config.home) return homeLoc();
  if (a.type === 'fav') { const f = favLoc(a.id); if (f) return f; }
  return currentLoc() || homeLoc();
}

function locateGps() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { state.geoError = 'Ortung nicht unterstützt'; return resolve(null); }
    navigator.geolocation.getCurrentPosition(
      p => { state.geo = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }; state.geoError = null; state.geoName = null; resolve(state.geo); },
      e => { state.geoError = e.code === 1 ? 'Ortung nicht erlaubt' : 'Ortung fehlgeschlagen'; resolve(null); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * MIN });
  });
}
async function locateIp() {
  try {
    const r = await getJSON('https://ipwho.is/?fields=success,city,region,latitude,longitude');
    if (!r.success || r.latitude == null) throw new Error();
    state.geo = { lat: r.latitude, lon: r.longitude, approx: true };
    state.geoName = `≈ ${r.city || r.region || 'Standort'}`; state.geoError = null;
    return state.geo;
  } catch { state.geoError = 'IP-Ortung fehlgeschlagen'; return null; }
}
const locate = () => config.current.mode === 'ip' ? locateIp() : config.current.mode === 'gps' ? locateGps() : Promise.resolve(null);

/* ======================= Suche (Photon / OpenStreetMap) ======================= */
async function placeSearch(text) {
  const r = await getJSON(`https://photon.komoot.io/api/?${q({ q: text, limit: 8, lang: 'de', lat: 51.2, lon: 10.4, zoom: 6, location_bias_scale: 0.1 })}`);
  const seen = new Set();
  let res = (r.features || []).map(f => {
    const p = f.properties, [lon, lat] = f.geometry.coordinates;
    const isPlz = p.osm_value === 'postcode';
    const street = p.street ? `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}` : null;
    const title = isPlz ? `${p.name} ${p.city || p.county || ''}`.trim() : street && p.name !== p.street ? `${p.name}, ${street}` : (street || p.name);
    const region = [isPlz ? null : [p.postcode, p.city !== p.name ? p.city : null].filter(Boolean).join(' '), p.state, p.countrycode !== 'DE' ? p.country : null].filter(Boolean).join(', ');
    const short = isPlz ? (p.city || p.name) : (street ? `${street}, ${p.city || p.name}` : p.name);
    return { title, region, short, state: p.state || p.country || '', lat, lon, de: p.countrycode === 'DE' };
  }).filter(x => { const k = `${x.title}|${x.region}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (/^\d{5}$/.test(text.trim()) && res.some(x => x.de)) res = res.filter(x => x.de);
  return res;
}
function bindSearch(input, list, onPick) {
  let t;
  const run = async () => {
    const v = input.value.trim();
    if (v.length < 2) { list.innerHTML = ''; return; }
    list.innerHTML = '<li class="muted">Suche …</li>';
    try {
      const res = await placeSearch(v);
      list.innerHTML = res.length ? '' : '<li class="muted">Nichts gefunden</li>';
      res.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `${esc(p.title)} <small>${esc(p.region)}</small>`;
        li.onclick = () => { list.innerHTML = ''; input.value = ''; input.blur(); onPick(p); };
        list.appendChild(li);
      });
    } catch { list.innerHTML = '<li class="error">Suche fehlgeschlagen</li>'; }
  };
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 450); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); run(); } });
}

/* ======================= Mond =======================
 * Mondposition, -beleuchtung und Auf-/Untergang nach dem Verfahren der Bibliothek SunCalc
 * Copyright (c) 2014, Vladimir Agafonkin – https://github.com/mourner/suncalc – BSD-2-Clause-Lizenz,
 * Lizenztext siehe THIRD-PARTY-NOTICES.md. Formeln aus „Astronomy Answers“ (aa.quae.nl).
 */
const Moon = (() => {
  const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const toDays = d => d / dayMs - 0.5 + J1970 - J2000;
  const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const alt = (H, phi, d) => Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
  const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const refr = h => { if (h < 0) h = 0; return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179)); };
  function sunCoords(d) {
    const M = rad * (357.5291 + 0.98560028 * d);
    const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    return { dec: dec(L, 0), ra: ra(L, 0) };
  }
  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d);
    const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F);
    return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  function altitude(date, lat, lon) {
    const d = toDays(date), c = moonCoords(d), H = sidereal(d, rad * -lon) - c.ra;
    const h = alt(H, rad * lat, c.dec);
    return h + refr(h);
  }
  function illumination(date) {
    const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI };
  }
  function times(date, lat, lon) {
    const t = new Date(date); t.setHours(0, 0, 0, 0);
    const at = h => altitude(new Date(t.getTime() + h * 36e5), lat, lon) - 0.133 * rad;
    let h0 = at(0), rise = null, set = null;
    for (let i = 1; i <= 24; i += 2) {
      const h1 = at(i), h2 = at(i + 1);
      const a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2, xe = -b / (2 * a), ye = (a * xe + b) * xe + h1, D = b * b - 4 * a * h1;
      let roots = 0, x1 = 0, x2 = 0;
      if (D >= 0) {
        const dx = Math.sqrt(D) / (Math.abs(a) * 2); x1 = xe - dx; x2 = xe + dx;
        if (Math.abs(x1) <= 1) roots++; if (Math.abs(x2) <= 1) roots++; if (x1 < -1) x1 = x2;
      }
      if (roots === 1) { if (h0 < 0) rise = i + x1; else set = i + x1; }
      else if (roots === 2) { rise = i + (ye < 0 ? x2 : x1); set = i + (ye < 0 ? x1 : x2); }
      if (rise != null && set != null) break;
      h0 = h2;
    }
    const toDate = h => h == null ? null : new Date(t.getTime() + h * 36e5);
    return { rise: toDate(rise), set: toDate(set) };
  }
  // Sonnenauf- und -untergang (Höhe −0,833° inkl. Refraktion), ohne Internet
  function sunTimes(date, lat, lon) {
    const lw = rad * -lon, phi = rad * lat, J0 = 0.0009;
    const t = new Date(date); t.setHours(12, 0, 0, 0);
    const d = toDays(t), n = Math.round(d - J0 - lw / (2 * Math.PI));
    const approx = (Ht) => J0 + (Ht + lw) / (2 * Math.PI) + n;
    const ds = approx(0), M = rad * (357.5291 + 0.98560028 * ds);
    const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    const decl = dec(L, 0), transit = j => J2000 + j + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const cosW = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
    if (cosW < -1 || cosW > 1) return { rise: null, set: null };          // Polartag / Polarnacht
    const Jnoon = transit(ds), Jset = transit(approx(Math.acos(cosW))), Jrise = Jnoon - (Jset - Jnoon);
    const fromJ = j => new Date((j + 0.5 - J1970) * dayMs);
    return { rise: fromJ(Jrise), set: fromJ(Jset) };
  }
  return { illumination, times, sunTimes };
})();
function moonInfo(lat, lon) {
  const now = new Date(), il = Moon.illumination(now), tm = Moon.times(now, lat, lon);
  const p = il.phase, f = il.fraction, waxing = p < 0.5;
  const name = p < 0.03 || p > 0.97 ? 'Neumond' : Math.abs(p - 0.5) < 0.03 ? 'Vollmond' : Math.abs(p - 0.25) < 0.03 ? 'erstes Viertel'
    : Math.abs(p - 0.75) < 0.03 ? 'letztes Viertel' : waxing ? 'zunehmend' : 'abnehmend';
  // Bild: beleuchteter Anteil, zunehmend rechts hell (Nordhalbkugel)
  const r = 9, rx = (Math.abs(1 - 2 * f) * r).toFixed(2), outer = waxing ? 1 : 0, inner = (f < 0.5) === waxing ? 0 : 1;
  const path = f < 0.01 ? '' : `M12 3 A${r} ${r} 0 0 ${outer} 12 21 A${rx} ${r} 0 0 ${inner} 12 3 Z`;
  return { ...tm, fraction: f, name, path, label: /mond|Viertel/.test(name) ? name : `${name} · ${Math.round(f * 100)} %` };
}

/* ======================= Daten laden ======================= */
async function settle(jobs) {
  const keys = Object.keys(jobs), res = await Promise.allSettled(Object.values(jobs)), out = {};
  keys.forEach((k, i) => {
    out[k] = res[i].status === 'fulfilled' ? res[i].value : null;
    if (res[i].status === 'rejected') { console.warn(k, res[i].reason); out[`${k}Err`] = String(res[i].reason?.message || res[i].reason); }
  });
  return out;
}
function fetchPlace(loc, full = true) {
  // Datenschutz: Koordinaten auf ~1 km runden – genauer braucht es fürs Wetter nicht
  const ll = { lat: loc.lat.toFixed(2), lon: loc.lon.toFixed(2) };
  const om = { latitude: ll.lat, longitude: ll.lon, timezone: 'Europe/Berlin' };
  const radarFrom = new Date(Math.floor((Date.now() - 10 * MIN) / (5 * MIN)) * 5 * MIN).toISOString();
  const jobs = {
    fc: getJSON(`https://api.open-meteo.com/v1/forecast?${q({
      ...om, models: 'icon_seamless', forecast_days: 7,
      current: 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl',
      hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,is_day,wind_speed_10m,wind_direction_10m,relative_humidity_2m,pressure_msl,dew_point_2m,snowfall,snow_depth,soil_temperature_0cm',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,wind_gusts_10m_max',
    })}`),
    aq: getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${q({ ...om, forecast_days: 2, current: 'european_aqi,pm10,pm2_5,nitrogen_dioxide', hourly: POLLEN.map(p => p[0]).join(',') })}`),
  };
  if (full) {
    jobs.current = getJSON(`https://api.brightsky.dev/current_weather?${q(ll)}`);
    jobs.alerts = getJSON(`https://api.brightsky.dev/alerts?${q(ll)}`);
    jobs.radar = getJSON(`https://api.brightsky.dev/radar?${q({ ...ll, distance: 5000, format: 'plain', date: radarFrom })}`);
  }
  return settle(jobs);
}

async function loadActive(scrollTop = true) {
  renderLocTabs();
  const loc = activeLoc();
  if (!loc) { renderNoLocation(); return; }
  const seq = ++state.loadSeq;
  if (!state.data || state.data.locKey !== loc.key) $('#wetterBody').innerHTML = '<div class="placeholder">Lädt …</div>';
  const d = await fetchPlace(loc, true);
  if (seq !== state.loadSeq) return;
  if (loc.key === 'current' && config.current.mode === 'gps' && d.alerts?.location?.name && !state.geoName) { state.geoName = d.alerts.location.name; loc.name = state.geoName; }
  d.locKey = loc.key; d.loc = loc;
  state.data = d; state.loadedAt = Date.now();
  if (loc.key === 'home') { state.homeData = d; state.homeAt = Date.now(); }
  renderLocTabs();
  renderWetter(loc, d);
  // Messwert des angezeigten Orts auch für seine Stecknadel auf der Karte verwenden
  const cw = d.current?.weather;
  if (cw?.temperature != null) {
    const prev = state.summary.get(loc.key) || {};
    state.summary.set(loc.key, { ...prev, t: cw.temperature, kind: BS_KIND[cw.icon] || prev.kind || 'cloud', text: BS_TEXT[cw.icon] || prev.text || '', note: prev.note ?? '', tone: prev.tone ?? '' });
    if (window.mobileMap?.ready) mobileMap.drawMine();
  }
  if (scrollTop) $('#wetterScroll').scrollTop = 0;
  if (window.mobileMap?.ready) mobileMap.center(loc);
}

/* ======================= Ortsreiter ======================= */
function renderLocTabs() {
  const a = config.active, cur = currentLoc(), fav = a.type === 'fav' ? favLoc(a.id) : null;
  const curName = cur ? cur.name : config.current.mode === 'manual' ? 'Standort' : (state.geoError ? 'Standort ?' : 'Standort');
  const isCur = a.type === 'current' || (a.type === 'home' && !config.home);
  const html = `
    <button role="tab" data-t="current" class="${isCur && state.view !== 'favs' ? 'on' : ''}" aria-selected="${isCur}">${ICO.pin}<span>${esc(curName)}</span></button>
    <button role="tab" data-t="home" class="${a.type === 'home' && config.home && state.view !== 'favs' ? 'on' : ''}" aria-selected="${a.type === 'home'}">${ICO.home}<span>${config.home ? 'Zuhause' : 'Zuhause +'}</span></button>
    <button role="tab" data-t="favs" class="${(fav || state.view === 'favs') ? 'on' : ''}" aria-selected="${!!fav}">${fav && state.view !== 'favs' ? ICO.starFill : ICO.star}<span>${fav && state.view !== 'favs' ? esc(fav.name) : 'Favoriten'}</span></button>`;
  $('#locTabs').innerHTML = html; $('#locTabs2').innerHTML = html;
}
function onLocTab(t) {
  if (t === 'favs') { showView('favs'); return; }
  if (t === 'home' && !config.home) { showView('mehr'); toast('Lege zuerst dein Zuhause fest'); return; }
  config.active = { type: t }; saveCfg();
  showView('wetter');
  loadActive();
}

/* ======================= Ansicht: Wetter ======================= */
function renderNoLocation() {
  const msg = config.current.mode === 'gps' && state.geoError
    ? `${esc(state.geoError)}. Erlaube die Ortung in den Browser-Einstellungen oder wähle eine andere Methode.` : 'Wähle einen Ort, um das Wetter zu sehen.';
  $('#wetterBody').innerHTML = `<div class="card"><p>${msg}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" onclick="setCurMode('ip')">Ungefähr über IP</button>
      <button class="btn" onclick="showView('mehr')">Ort festlegen</button>
    </div></div>`;
}

const POLLEN = [['alder_pollen', 'Erle'], ['birch_pollen', 'Birke'], ['grass_pollen', 'Gräser'], ['mugwort_pollen', 'Beifuß'], ['ragweed_pollen', 'Ambrosia']];

function hourIndexNow(times) {
  const now = Date.now();
  let i = times.findIndex(t => new Date(t).getTime() > now - 60 * MIN);
  return i < 0 ? 0 : i;
}
function pressureTrend(h, i0) {
  const p = h.pressure_msl; if (!p || i0 < 3 || p[i0] == null || p[i0 - 3] == null) return '';
  const d = p[i0] - p[i0 - 3];
  if (Math.abs(d) < 0.5) return 'gleichbleibend';
  return `${Math.abs(d) < 1.5 ? 'leicht ' : ''}${d > 0 ? 'steigend' : 'fallend'}`;
}
function nowcastSeries(radar) {
  const frames = radar?.radar, pos = radar?.latlon_position;
  if (!frames?.length || !pos) return null;
  return frames.map(fr => {
    const g = fr.precipitation_5;
    const y = clamp(Math.floor(pos.y), 0, g.length - 1), x = clamp(Math.floor(pos.x), 0, g[0].length - 1);
    return { t: new Date(fr.timestamp).getTime(), mmh: g[y][x] / 100 * 12 };
  });
}
function nowcastHtml(d, snowLikely) {
  const s = nowcastSeries(d.radar);
  if (!s) return '';
  const now = Date.now(), THR = 0.1, fut = s.filter(p => p.t >= now - 2.5 * MIN), end = s[s.length - 1].t;
  const word = snowLikely ? 'Schnee' : 'Regen';
  let txt, color = 'var(--ok)';
  if (fut.length && fut[0].mmh >= THR) {
    const stop = fut.findIndex((p, i) => i > 0 && p.mmh < THR && (fut[i + 1]?.mmh ?? 0) < THR);
    txt = stop > 0 ? `${word} bis ca. ${fmtTime(fut[stop].t)}` : `${word} hält an`; color = snowLikely ? 'var(--snow)' : 'var(--rain)';
  } else {
    const first = fut.find(p => p.mmh >= THR);
    if (first) { txt = `${word} ab ca. ${fmtTime(first.t)}`; color = snowLikely ? 'var(--snow)' : 'var(--rain)'; }
    else txt = `Trocken bis ${fmtTime(end)}`;
  }
  const max = Math.max(2, ...s.map(p => p.mmh));
  const bars = s.filter((_, i) => i % 1 === 0).map(p => `<i style="height:${p.mmh > 0 ? Math.max(2, Math.sqrt(p.mmh / max) * 16) : 0}px;opacity:${p.t > now ? 1 : .45}"></i>`).join('');
  return `<section class="strip" aria-label="Niederschlag nächste 2 Stunden">
    <svg viewBox="0 0 24 24" style="width:18px;height:18px;color:${color};flex:none" aria-hidden="true">${ICO.drop}</svg>
    <div class="nc-text"><b style="color:${color}">${txt}</b><small>Radar, nächste 2 Std.</small></div>
    <div class="nc-bars" aria-hidden="true"><div class="bars">${bars}</div><div class="lbl"><span>jetzt</span><span>+1 h</span><span>+2 h</span></div></div>
  </section>`;
}

function renderWetter(loc, d) {
  const body = $('#wetterBody');
  const fc = d.fc, w = d.current?.weather, src = d.current?.sources?.[0], om = fc?.current;
  if (!fc && !w) { body.innerHTML = '<div class="card error">Wetterdaten nicht verfügbar. Ziehe zum Aktualisieren nach unten.</div>'; return; }
  const h = fc?.hourly, dd = fc?.daily, i0 = h ? hourIndexNow(h.time) : 0;
  const isDay = om ? om.is_day === 1 : true;
  const kind = w?.icon ? (BS_KIND[w.icon] || 'cloud') : wxKind(om?.weather_code, isDay);
  const cond = om ? (WMO_TEXT[om.weather_code] || '') : (BS_TEXT[w?.icon] || '');
  const temp = w?.temperature ?? om?.temperature_2m;
  const wdir = w?.wind_direction_10 ?? om?.wind_direction_10m, wspd = w?.wind_speed_10 ?? om?.wind_speed_10m, gust = w?.wind_gust_speed_10 ?? om?.wind_gusts_10m;
  const press = w?.pressure_msl ?? om?.pressure_msl, rh = w?.relative_humidity ?? om?.relative_humidity_2m, dew = w?.dew_point ?? h?.dew_point_2m?.[i0];
  const trend = h ? pressureTrend(h, i0) : '';
  const snowLikely = (temp ?? 5) <= 1;
  // gefühlte Temperatur: vom Modell, sonst aus Messwerten (Windchill nach DWD/JAG-TI-Formel)
  const feels = om?.apparent_temperature ?? (temp != null && wspd != null && temp <= 10 && wspd > 4.8
    ? 13.12 + 0.6215 * temp - 11.37 * wspd ** 0.16 + 0.3965 * temp * wspd ** 0.16 : temp);
  const sub = [`gefühlt ${deg(feels)}`];
  if (dd?.temperature_2m_min?.[0] != null) sub.push(`↓ ${deg(dd.temperature_2m_min[0])} ↑ ${deg(dd.temperature_2m_max[0])}`);
  const fcDown = !fc ? (/429/.test(d.fcErr || '') ? 'Das Tageslimit des Vorhersagedienstes ist für diese Internetverbindung erreicht – ab morgen wieder verfügbar.'
    : 'Der Vorhersagedienst ist gerade nicht erreichbar.') : '';

  // Sonne & Mond (Sonnenzeiten notfalls selbst berechnet)
  const st = Moon.sunTimes(new Date(), loc.lat, loc.lon);
  const sr = dd?.sunrise?.[0] ?? st.rise, ss = dd?.sunset?.[0] ?? st.set;
  const dayLen = sr && ss ? (new Date(ss) - new Date(sr)) / MIN : null;
  const mi = moonInfo(loc.lat, loc.lon);

  // Warnungen
  const alerts = (d.alerts?.alerts || []).filter(a => !a.expires || new Date(a.expires) > Date.now());
  const warnHtml = alerts.map(a => `
    <details class="warn ${a.severity === 'severe' || a.severity === 'extreme' ? 'severe' : ''}">
      <summary>${ICO.warn}<span style="flex:1"><b>${esc(titleCase(a.event_de || ''))}</b> · ${a.expires ? `bis ${fmtWdTime(a.expires)}` : 'aktiv'}</span>›</summary>
      <div class="body">${esc(a.description_de || '')}${a.instruction_de ? `<br><br>${esc(a.instruction_de).replace(/\n/g, '<br>')}` : ''}</div>
    </details>`).join('');

  // Stündlich (24 h)
  let hours = '';
  if (h) {
    for (let i = i0; i < Math.min(i0 + 24, h.time.length); i++) {
      const t = new Date(h.time[i]), isNow = i === i0;
      const pr = h.precipitation[i], pp = h.precipitation_probability?.[i];
      const dirTxt = `Wind aus ${dirName(h.wind_direction_10m[i])}, ${r0(h.wind_speed_10m[i])} km/h`;
      hours += `<div class="hour ${isNow ? 'now' : ''} ${t.getHours() === 0 && !isNow ? 'daystart' : ''}">
        <div class="t">${isNow ? 'Jetzt' : t.getHours() === 0 ? t.toLocaleDateString(de, { weekday: 'short' }) : t.getHours()}</div>
        ${icon(wxKind(h.weather_code[i], h.is_day[i]))}
        <div class="tp">${deg(h.temperature_2m[i])}</div>
        <div class="pp">${pr >= 0.1 ? r1(pr) : pp >= 30 ? `${pp}%` : ''}</div>
        <div class="extra">
          ${windArrow(h.wind_direction_10m[i], dirTxt)}
          <b>${r0(h.wind_speed_10m[i])}<small> km/h</small></b>
          <b style="margin-top:2px">${r0(h.relative_humidity_2m[i])} %</b>
          <b>${r0(h.pressure_msl[i])}</b>
        </div>
      </div>`;
    }
  }

  // Tage
  let days = '';
  if (dd) {
    const lo = Math.min(...dd.temperature_2m_min), hi = Math.max(...dd.temperature_2m_max), span = Math.max(1, hi - lo);
    dd.time.forEach((t, i) => {
      const a = (dd.temperature_2m_min[i] - lo) / span * 100, b = (dd.temperature_2m_max[i] - lo) / span * 100;
      const name = i === 0 ? 'Heute' : i === 1 ? 'Morgen' : new Date(t).toLocaleDateString(de, { weekday: 'short', day: 'numeric' });
      const ps = dd.precipitation_sum[i];
      days += `<div class="day">
        <div class="dn">${name}</div>${icon(wxKind(dd.weather_code[i], 1), 'ico', WMO_TEXT[dd.weather_code[i]])}
        <div class="mn">${deg(dd.temperature_2m_min[i])}</div>
        <div class="bar"><span style="left:${a}%;width:${Math.max(3, b - a)}%"></span></div>
        <div class="mx">${deg(dd.temperature_2m_max[i])}</div>
        <div class="pr">${ps >= 0.1 ? `${r1(ps)} mm` : ''}</div>
      </div>`;
    });
  }

  body.innerHTML = `
    ${loc.key.startsWith('fav') ? `<div class="place-name">${ICO.starFill.replace('<svg', '<svg style="width:14px;height:14px;color:var(--accent)"')} ${esc(loc.name)}${loc.region ? ` <span class="muted">· ${esc(loc.region)}</span>` : ''}</div>` : ''}
    <div class="hero">
      <div style="min-width:0">
        <div class="temp">${deg(temp)}</div>
        <div class="cond">${esc(cond)}</div>
        <div class="line" style="color:var(--muted)">${sub.join(' · ')}</div>
        <div class="line">${windArrow(wdir, `Wind aus ${dirName(wdir)}`)}Wind ${r0(wspd)} km/h aus ${dirName(wdir)}${gust ? ` · Böen ${r0(gust)}` : ''}</div>
        <div class="line"><svg viewBox="0 0 24 24" aria-hidden="true">${ICO.gauge}</svg>${r0(press)} hPa${trend ? ` <span class="muted">· ${trend}</span>` : ''}</div>
        <div class="line"><svg viewBox="0 0 24 24" aria-hidden="true">${ICO.drop}</svg>Feuchte ${r0(rh)} %${dew != null ? ` <span class="muted">· Taupunkt ${r1(dew)}°</span>` : ''}</div>
      </div>
      ${icon(kind, 'big-ico', cond)}
    </div>
    <div class="station">${w && src ? `Messstation ${esc(stationName(src.station_name))} (${r1(src.distance / 1000)} km) · ${fmtTime(w.timestamp)} Uhr · DWD` : 'Modellwerte DWD ICON'}</div>

    <section class="sunmoon" aria-label="Sonne und Mond">
      <div><svg viewBox="0 0 24 24" style="color:#f6c343" aria-hidden="true"><path d="M3 18h18"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 6v3M5.6 10.6l1.6 1.6M18.4 10.6l-1.6 1.6"/></svg>
        <div><b>↑ ${sr ? fmtTime(sr) : '–'} <span class="muted">·</span> ↓ ${ss ? fmtTime(ss) : '–'}</b><small>${dayLen ? `${Math.floor(dayLen / 60)} Std. ${Math.round(dayLen % 60)} Min. Tag` : ''}</small></div></div>
      <div><svg viewBox="0 0 24 24" role="img" aria-label="Mond ${esc(mi.label)}" style="stroke:none"><circle cx="12" cy="12" r="9" fill="#2a3445" stroke="#5b6b82" stroke-width="1"/>${mi.path ? `<path d="${mi.path}" fill="#e9eef5"/>` : ''}</svg>
        <div><b>↑ ${mi.rise ? fmtTime(mi.rise) : '–'} <span class="muted">·</span> ↓ ${mi.set ? fmtTime(mi.set) : '–'}</b><small>${esc(mi.label)}</small></div></div>
    </section>

    ${warnHtml}
    ${nowcastHtml(d, snowLikely)}

    ${fcDown ? `<section class="card" aria-label="Vorhersage nicht verfügbar"><div class="h2">Vorhersage</div>
      <p style="margin:0">${fcDown}</p><p class="hint" style="margin:6px 0 0">Messwerte, Warnungen und Radar kommen weiter direkt vom DWD.</p></section>` : `
    <section class="card" aria-label="Stündlich" style="padding:10px 4px 10px 10px">
      <div class="row-between" style="padding-right:10px;margin-bottom:6px"><div class="h2" style="margin:0">Stündlich</div><div style="font-size:10px;color:var(--muted)">unten: Wind · Feuchte · Druck hPa</div></div>
      <div class="hours">${hours}</div>
    </section>

    <section class="card" aria-label="Nächste Tage">
      <div class="h2">Nächste Tage</div>
      ${days}
    </section>`}
    <p class="hint">Stand ${fmtTime(state.loadedAt || Date.now())} · Quelle: Deutscher Wetterdienst, Wetterdaten von Open-Meteo.com · ohne Gewähr</p>`;
}

/* ======================= Ansicht: Favoriten ======================= */
async function loadSummaries(force) {
  const locs = [currentLoc(), homeLoc(), ...config.favs.map(f => favLoc(f.id))].filter(Boolean);
  if (!locs.length) return;
  if (!force && Date.now() - state.summaryAt < 10 * MIN && locs.every(l => state.summary.has(l.key))) return;
  const lat = locs.map(l => l.lat.toFixed(2)).join(','), lon = locs.map(l => l.lon.toFixed(2)).join(',');
  const alertsP = Promise.all(locs.map(l => l.key.startsWith('fav') ? getJSON(`https://api.brightsky.dev/alerts?lat=${l.lat.toFixed(2)}&lon=${l.lon.toFixed(2)}`).catch(() => null) : null));
  const warnNote = a => { const al = (a?.alerts || []).filter(x => !x.expires || new Date(x.expires) > Date.now()); return al.length ? `${titleCase(al[0].event_de || 'Warnung')}${al[0].expires ? ` bis ${fmtWdTime(al[0].expires)}` : ''}` : null; };
  try {
    const r = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&models=icon_seamless&timezone=Europe%2FBerlin&forecast_days=2&` +
      q({ current: 'temperature_2m,weather_code,is_day', daily: 'temperature_2m_min,temperature_2m_max', hourly: 'precipitation,snowfall,wind_gusts_10m' }));
    const arr = Array.isArray(r) ? r : [r];
    const alerts = await alertsP;
    const now = Date.now();
    locs.forEach((l, k) => {
      const x = arr[k]; if (!x) return;
      const h = x.hourly, idx = h.time.map((t, i) => [new Date(t).getTime(), i]).filter(([t]) => t > now - 30 * MIN && t < now + 24 * 60 * MIN).map(([, i]) => i);
      const wet = idx.find(i => h.precipitation[i] >= 0.2);
      const gust = Math.max(0, ...idx.map(i => h.wind_gusts_10m[i] || 0));
      const al = (alerts[k]?.alerts || []).filter(a => !a.expires || new Date(a.expires) > now);
      let note = 'Trocken in den nächsten 24 Std.', tone = '';
      if (al.length) { note = `${titleCase(al[0].event_de || 'Warnung')}${al[0].expires ? ` bis ${fmtWdTime(al[0].expires)}` : ''}`; tone = 'warn-t'; }
      else if (wet != null) {
        const snow = h.snowfall[wet] > 0;
        note = `${snow ? 'Schnee' : 'Regen'} ab ${new Date(h.time[wet]).getHours()} Uhr${gust >= 50 ? ` · Böen ${r0(gust)} km/h` : ''}`; tone = snow ? 'snow-t' : 'rain-t';
      } else if (gust >= 50) { note = `Windig · Böen bis ${r0(gust)} km/h`; tone = 'rain-t'; }
      state.summary.set(l.key, { t: x.current.temperature_2m, code: x.current.weather_code, isDay: x.current.is_day, min: x.daily.temperature_2m_min[0], max: x.daily.temperature_2m_max[0], note, tone });
    });
    state.summaryAt = Date.now();
  } catch (e) {
    // Ersatz, wenn Open-Meteo nicht antwortet (z. B. Tageslimit): Messwerte der nächsten DWD-Station über Bright Sky
    console.warn('Übersicht: Ersatz über DWD-Messwerte', e);
    const [alerts, cur] = await Promise.all([alertsP, Promise.all(locs.map(l =>
      getJSON(`https://api.brightsky.dev/current_weather?lat=${l.lat.toFixed(2)}&lon=${l.lon.toFixed(2)}`).catch(() => null)))]);
    locs.forEach((l, k) => {
      const w = cur[k]?.weather; if (!w) return;
      const wn = warnNote(alerts[k]);
      state.summary.set(l.key, { t: w.temperature, kind: BS_KIND[w.icon] || 'cloud', text: BS_TEXT[w.icon] || '', min: null, max: null,
        note: wn || 'Messwert der nächsten DWD-Station', tone: wn ? 'warn-t' : '' });
    });
    state.summaryAt = Date.now() - 7 * MIN;    // bald erneut versuchen
  }
}
// Symbol für eine Kurzübersicht (Modellcode oder DWD-Messung)
const summaryKind = s => s.kind || wxKind(s.code, s.isDay);

function renderFavs() {
  renderLocTabs();
  const list = $('#favList');
  $('#favEdit').textContent = state.favEditing ? 'Fertig' : 'Bearbeiten';
  $('#favEdit').classList.toggle('on', state.favEditing);
  if (!config.favs.length) { list.innerHTML = '<div class="card muted">Noch keine Favoriten. Suche oben nach einem Ort, um ihn hinzuzufügen.</div>'; return; }
  list.innerHTML = config.favs.map((f, i) => {
    const s = state.summary.get(`fav:${f.id}`);
    const right = state.favEditing
      ? `<span class="icon-round" data-up="${i}" role="button" aria-label="${esc(f.name)} nach oben">↑</span><span class="icon-round" data-down="${i}" role="button" aria-label="${esc(f.name)} nach unten">↓</span><span class="icon-round" data-del="${i}" role="button" aria-label="${esc(f.name)} entfernen" style="color:#ff9a9a">✕</span>`
      : `${s ? icon(summaryKind(s), 'ico', s.text || WMO_TEXT[s.code]) : '<span></span>'}<div class="tt"><b>${s ? deg(s.t) : '…'}</b><small>${s && s.min != null ? `<span style="color:var(--cold)">${deg(s.min)}</span> / <span style="color:var(--warm)">${deg(s.max)}</span>` : ''}</small></div>`;
    return `<button class="fav ${state.favEditing ? 'editing' : ''}" data-open="${f.id}">
      <div style="min-width:0"><div class="nm">${esc(f.name)}</div><div class="rg">${esc(f.region || '')}</div><div class="nt ${s?.tone || ''}">${s ? esc(s.note) : 'Lädt …'}</div></div>
      ${right}</button>`;
  }).join('');
}

function bindFavs() {
  bindSearch($('#favSearch'), $('#favResults'), p => {
    if (config.favs.some(f => Math.abs(f.lat - p.lat) < 0.01 && Math.abs(f.lon - p.lon) < 0.01)) { toast('Ist schon in deinen Favoriten'); return; }
    config.favs.push({ id: Date.now().toString(36), name: p.short, region: p.state, lat: p.lat, lon: p.lon });
    saveCfg(); renderFavs(); toast(`${p.short} hinzugefügt`);
    loadSummaries(true).then(renderFavs);
  });
  $('#favEdit').onclick = () => { state.favEditing = !state.favEditing; renderFavs(); };
  $('#favList').addEventListener('click', e => {
    const up = e.target.closest('[data-up]'), down = e.target.closest('[data-down]'), del = e.target.closest('[data-del]');
    const move = (i, j) => { if (j < 0 || j >= config.favs.length) return; [config.favs[i], config.favs[j]] = [config.favs[j], config.favs[i]]; saveCfg(); renderFavs(); };
    if (up) { e.preventDefault(); move(+up.dataset.up, +up.dataset.up - 1); return; }
    if (down) { e.preventDefault(); move(+down.dataset.down, +down.dataset.down + 1); return; }
    if (del) {
      e.preventDefault();
      const f = config.favs[+del.dataset.del];
      if (!confirm(`„${f.name}“ aus den Favoriten entfernen?`)) return;
      config.favs.splice(+del.dataset.del, 1);
      if (config.active.type === 'fav' && config.active.id === f.id) config.active = { type: 'current' };
      saveCfg(); renderFavs(); return;
    }
    const open = e.target.closest('[data-open]');
    if (open && !state.favEditing) { config.active = { type: 'fav', id: open.dataset.open }; saveCfg(); showView('wetter'); loadActive(); }
  });
}

/* ======================= Ansicht: PV & Luft ======================= */
const PV_COLORS = ['#f6c343', '#6cc3ff', '#ff8a65', '#7ee2b0', '#c79bff', '#ff6fae'];
async function fetchPvPerKwp(loc, planes) {
  const res = await Promise.all(planes.map(p => getJSON(`https://api.open-meteo.com/v1/forecast?${q({
    latitude: loc.lat.toFixed(2), longitude: loc.lon.toFixed(2), timezone: 'Europe/Berlin', forecast_days: 3, models: 'icon_seamless',
    minutely_15: 'global_tilted_irradiance,temperature_2m', tilt: p.tilt ?? 30, azimuth: p.azimuth ?? 0,
  })}`)));
  const times = res[0].minutely_15.time.map(t => new Date(t).getTime());
  // Leistung je kWp (kW/kWp): Einstrahlung/1000 × 0,86 Systemfaktor × Temperatureinfluss
  const series = res.map(r => r.minutely_15.time.map((_, i) => {
    const g = r.minutely_15.global_tilted_irradiance[i] || 0, ta = r.minutely_15.temperature_2m[i] ?? 15, tc = ta + g / 800 * 25;
    return Math.max(0, g / 1000 * 0.86 * (1 - 0.004 * (tc - 25)));
  }));
  return { times, series, at: Date.now() };
}
function dayStart(k) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + k); return d.getTime(); }

async function renderPv() {
  const body = $('#pvBody');
  const home = homeLoc(), loc = home || activeLoc();
  if (!loc) { body.innerHTML = '<div class="card">Lege unter „Mehr“ dein Zuhause fest.</div>'; return; }
  body.innerHTML = `<div class="row-between"><h1 class="h1" style="display:flex;align-items:center;gap:8px">${home ? ICO.home.replace('<svg', '<svg style="width:18px;height:18px;color:var(--muted)"') : ''}${esc(home ? 'Zuhause' : loc.name)}</h1></div><div class="placeholder">Lädt …</div>`;

  const userPlanes = (config.pv.planes || []).filter(p => p.kwp > 0 || p.tilt != null);
  const demo = !userPlanes.length;
  const planes = demo ? [{ name: 'Beispiel Süd', tilt: 35, azimuth: 0 }] : userPlanes;
  const key = JSON.stringify([loc.lat, loc.lon, planes]);
  const [pv, hd] = await Promise.all([
    state.pv?.key === key && Date.now() - state.pv.at < 30 * MIN ? state.pv : fetchPvPerKwp(loc, planes).then(x => ({ ...x, key })).catch(() => null),
    home && state.homeData && Date.now() - state.homeAt < 10 * MIN ? state.homeData : fetchPlace(loc, false),
  ]);
  if (pv) state.pv = pv;
  if (home && hd) { state.homeData = state.homeData && state.homeData.current ? state.homeData : hd; state.homeAt = state.homeAt || Date.now(); }

  // ---- PV-Tabelle je Fläche ----
  let pvHtml = '<div class="card error">PV-Prognose nicht verfügbar.</div>';
  if (pv) {
    const sum = (s, a, b) => pv.times.reduce((acc, t, i) => t > a && t <= b ? acc + s[i] * 0.25 : acc, 0);
    const dN = new Date(dayStart(2)).toLocaleDateString(de, { weekday: 'short' }).replace('.', '');
    const rows = planes.map((p, k) => {
      const c = PV_COLORS[k % PV_COLORS.length];
      const az = p.azimuth ?? 0, azTxt = az === 0 ? 'S' : Math.abs(az) === 180 ? 'N' : `${az < 0 ? 'O' : 'W'}${Math.abs(az) !== 90 ? (Math.abs(az) < 90 ? '·S' : '·N') : ''}`;
      return `<div class="pv-tr"><span class="nm"><i style="background:${c}"></i><span>${esc(p.name || `Fläche ${k + 1}`)} <span class="muted" style="font-size:11px">${p.tilt ?? 30}° · ${azTxt}</span></span></span>
        <span>${r2(sum(pv.series[k], dayStart(0), dayStart(1)))}</span><span class="mid">${r2(sum(pv.series[k], dayStart(1), dayStart(2)))}</span><span>${r2(sum(pv.series[k], dayStart(2), dayStart(3)))}</span></div>`;
    }).join('');
    // Kurven für morgen
    const sel = pv.times.map((t, i) => [t, i]).filter(([t]) => t > dayStart(1) + 6 * 36e5 && t <= dayStart(1) + 18 * 36e5);
    const maxV = Math.max(0.05, ...pv.series.flatMap(s => sel.map(([, i]) => s[i])));
    const W = 330, H = 80, x = j => j / (sel.length - 1) * W, y = v => H - 4 - v / maxV * (H - 10);
    const paths = pv.series.map((s, k) => {
      const c = PV_COLORS[k % PV_COLORS.length];
      const d = sel.map(([, i], j) => `${j ? 'L' : 'M'}${x(j).toFixed(1)} ${y(s[i]).toFixed(1)}`).join(' ');
      return `<path d="${d}" stroke="${c}" stroke-width="${k ? 2 : 2.4}" fill="none"/>`;
    }).join('');
    const now = Date.now(), nowI = pv.times.findIndex(t => t >= now);
    const nowSum = nowI >= 0 ? pv.series.map(s => s[nowI]) : [];
    pvHtml = `<section class="card" aria-label="PV-Prognose">
      <div class="row-between"><div class="h2" style="margin:0">PV-Prognose · pro 1 kWp</div><span style="font-size:11px;color:var(--muted)">kWh je kWp</span></div>
      ${demo ? '<p class="hint" style="margin:6px 0 0">Beispiel für eine Südfläche (35°). Lege deine Flächen unter „Mehr → PV-Anlage“ an.</p>' : ''}
      <div class="pv-table" style="margin-top:8px">
        <div class="pv-tr head"><span>Fläche</span><span>Heute</span><span>Morgen</span><span>${dN}</span></div>${rows}
      </div>
      <div class="row-between" style="margin-top:10px"><div style="font-size:11px;font-weight:600;color:var(--soft)">Morgen im Tagesverlauf</div><div style="font-size:10px;color:var(--muted)">kW je kWp · max ${r2(maxV)}</div></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:84px;margin-top:4px" role="img" aria-label="PV-Leistung morgen je Fläche">
        <line x1="0" y1="${H - 4}" x2="${W}" y2="${H - 4}" stroke="#273244"/><line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H - 4}" stroke="#273244" stroke-dasharray="3 3"/>${paths}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted)"><span>6</span><span>9</span><span>12</span><span>15</span><span>18 Uhr</span></div>
      <p class="hint">Ertrag einer Fläche = Wert × deren kWp.${nowSum.length ? ` Jetzt: ${nowSum.map(v => `${r0(v * 1000)} W`).join(' / ')} je kWp.` : ''}</p>
    </section>`;
  }

  body.innerHTML = `<div class="row-between"><h1 class="h1" style="display:flex;align-items:center;gap:8px">${home ? ICO.home.replace('<svg', '<svg style="width:18px;height:18px;color:var(--muted)"') : ''}${esc(home ? 'Zuhause' : loc.name)}</h1></div>
    ${pvHtml}${airHtml(hd)}${winterHtml(hd)}`;
}

const AQI = [[20, 'sehr gut', '#3ecf8e'], [40, 'gut', '#9be15d'], [60, 'mittel', '#f5d142'], [80, 'schlecht', '#ff9a2e'], [100, 'sehr schlecht', '#ff4d4d'], [Infinity, 'extrem schlecht', '#c04dff']];
const pollenLevel = v => v < 1 ? null : v < 10 ? 'gering' : v < 50 ? 'mäßig' : v < 200 ? 'hoch' : 'sehr hoch';
function airHtml(d) {
  const a = d?.aq;
  if (!a?.current) return '<section class="card"><div class="h2">Luft &amp; Pollen</div><p class="error">Nicht verfügbar.</p></section>';
  const c = a.current, [, word, color] = AQI.find(([m]) => (c.european_aqi ?? 0) <= m), now = Date.now();
  const idx = a.hourly.time.map((t, i) => [new Date(t).getTime(), i]).filter(([t]) => t >= now - 60 * MIN && t <= now + 24 * 60 * MIN).map(([, i]) => i);
  const pollen = POLLEN.map(([k, n]) => [n, Math.max(0, ...idx.map(i => a.hourly[k]?.[i] ?? 0))]).map(([n, v]) => [n, pollenLevel(v)]).filter(p => p[1]);
  return `<section class="card" aria-label="Luft und Pollen" style="display:flex;flex-direction:column;gap:10px">
    <div class="h2" style="margin:0">Luft &amp; Pollen</div>
    <div style="display:flex;align-items:center;gap:12px"><div class="aqi" style="border-color:${color}">${r0(c.european_aqi)}</div>
      <div><div style="font-size:15px;font-weight:600">Luftqualität ${word}</div><div style="font-size:12px;color:var(--muted)">PM10 ${r0(c.pm10)} · PM2,5 ${r0(c.pm2_5)} · NO₂ ${r0(c.nitrogen_dioxide)} µg/m³</div></div></div>
    ${pollen.length ? `<div class="chips">${pollen.map(([n, l]) => `<span class="chip">${n}: ${l}</span>`).join('')}</div>`
      : `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ok)"><svg viewBox="0 0 24 24" style="width:18px;height:18px" aria-hidden="true"><path d="M5 21c0-8 6-14 15-15-1 9-7 15-15 15z"/><path d="M5 21l7-7"/></svg>Keine nennenswerten Pollen (24 h)</div>`}
  </section>`;
}
function winterHtml(d) {
  const h = d?.fc?.hourly; if (!h) return '';
  const now = Date.now();
  const idx = h.time.map((t, i) => [new Date(t).getTime(), i]).filter(([t]) => t >= now - 30 * MIN && t <= now + 24 * 60 * MIN).map(([, i]) => i);
  if (!idx.length) return '';
  let minI = idx[0]; for (const i of idx) if (h.temperature_2m[i] < h.temperature_2m[minI]) minI = i;
  const frostH = idx.filter(i => h.temperature_2m[i] < 0).length, snow = idx.reduce((s, i) => s + (h.snowfall?.[i] || 0), 0);
  const wet = idx.find(i => h.temperature_2m[i] <= 1 && ((h.precipitation[i] || 0) > 0.05 || (h.snowfall?.[i] || 0) > 0));
  const rime = idx.find(i => (h.soil_temperature_0cm?.[i] ?? 9) <= 0 && h.temperature_2m[i] - (h.dew_point_2m?.[i] ?? -99) <= 1);
  let msg, col = 'var(--ok)';
  if (wet != null) { msg = `Glätte durch Niederschlag möglich ab ${fmtWdTime(h.time[wet])}`; col = '#ff9a2e'; }
  else if (rime != null) { msg = `Reifglätte möglich ab ${fmtWdTime(h.time[rime])}`; col = '#ff9a2e'; }
  else if (frostH) { msg = 'Frost, aber keine Glätte erwartet'; col = '#9cc8ff'; }
  else msg = 'Kein Frost und keine Glätte erwartet';
  return `<section class="card" aria-label="Frost, Schnee und Glätte" style="display:flex;flex-direction:column;gap:10px">
    <div class="h2" style="margin:0">Frost, Schnee &amp; Glätte</div>
    <div style="font-size:15px;font-weight:600;color:${col}">${msg}</div>
    <div class="tiles3">
      <div class="tile"><small>Tiefstwert</small><b>${r1(h.temperature_2m[minI])}°</b></div>
      <div class="tile"><small>Frost-Std.</small><b>${frostH} / 24</b></div>
      <div class="tile"><small>Neuschnee</small><b>${r1(snow)} cm</b></div>
    </div>
    <p class="hint" style="margin:0">Abschätzung aus dem DWD-ICON-Modell. Amtliche Glättewarnungen stehen unter „Wetter“.</p>
  </section>`;
}

/* ======================= Ansicht: Mehr / Einstellungen ======================= */
const AZIMUTHS = [[-90, 'Ost'], [-67.5, 'Ost-Südost'], [-45, 'Südost'], [-22.5, 'Süd-Südost'], [0, 'Süd'], [22.5, 'Süd-Südwest'], [45, 'Südwest'], [67.5, 'West-Südwest'], [90, 'West'], [135, 'Nordwest'], [180, 'Nord'], [-135, 'Nordost']];
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (state.view === 'mehr') renderMehr(); });

function renderMehr() {
  const c = config.current, g = state.geo;
  const status = c.mode === 'manual' ? (c.lat != null ? `Fester Ort: ${c.name}` : 'Noch kein Ort gewählt')
    : g ? `Gefunden: ${state.geoName || `${g.lat.toFixed(3)}, ${g.lon.toFixed(3)}`}${g.approx ? ' (ungefähr)' : ''}` : (state.geoError || 'Noch nicht ermittelt');
  const R = (v, t, s) => `<label class="radio"><input type="radio" name="curMode" value="${v}" ${c.mode === v ? 'checked' : ''}><span>${t}<small>${s}</small></span></label>`;
  $('#mehrBody').innerHTML = `
    <h1 class="h1">Einstellungen</h1>

    <section class="card set-sec">
      <div class="h2" style="margin:0">Zuhause</div>
      <div>${config.home ? `${ICO.home.replace('<svg', '<svg style="width:15px;height:15px;vertical-align:-2px"')} ${esc(config.home.name)}` : '<span class="muted">Noch nicht festgelegt</span>'}</div>
      <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input id="homeSearch" type="search" placeholder="Adresse, Ort oder PLZ …" aria-label="Zuhause suchen" autocomplete="off" enterkeyhint="search"></label>
      <ul id="homeResults" class="results"></ul>
      <button class="btn" id="homeHere">Aktuellen Standort als Zuhause</button>
    </section>

    <section class="card set-sec">
      <div class="h2" style="margin:0">Standort</div>
      ${R('gps', 'Automatisch (GPS)', 'Genau, braucht die Ortungs-Erlaubnis')}
      ${R('ip', 'Ungefähr über Internet-Adresse', 'Ohne Erlaubnis, etwa auf Stadtebene (ipwho.is)')}
      ${R('manual', 'Fester Ort', 'Immer derselbe Ort')}
      <div class="hint" style="margin:0">${esc(status)}</div>
      <div id="curManual" ${c.mode === 'manual' ? '' : 'hidden'}>
        <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input id="curSearch" type="search" placeholder="Ort für „Standort“ suchen …" aria-label="Standort suchen" autocomplete="off" enterkeyhint="search"></label>
        <ul id="curResults" class="results"></ul>
      </div>
    </section>

    <section class="card set-sec">
      <div class="h2" style="margin:0">PV-Anlage (Zuhause)</div>
      <p class="hint" style="margin:0">Eine Fläche je Dachseite bzw. Modulfeld. Ausrichtung: Süd = 0°, Ost = −90°, West = 90°.</p>
      <div id="planes" class="set-sec">${(config.pv.planes || []).map((p, i) => `
        <div class="plane" data-i="${i}">
          <label class="full">Name<input data-k="name" value="${esc(p.name || '')}" placeholder="z. B. Dach Süd"></label>
          <button class="icon-round del" data-del="${i}" aria-label="Fläche entfernen">✕</button>
          <label>kWp<input data-k="kwp" type="number" inputmode="decimal" step="0.01" min="0" value="${p.kwp ?? ''}"></label>
          <label>Neigung °<input data-k="tilt" type="number" inputmode="numeric" min="0" max="90" value="${p.tilt ?? 30}"></label>
          <label>Ausrichtung<select data-k="azimuth">${AZIMUTHS.map(([a, n]) => `<option value="${a}" ${a === (p.azimuth ?? 0) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>WR-Limit kW<input data-k="limit" type="number" inputmode="decimal" step="0.1" min="0" value="${p.limit ?? ''}" placeholder="–"></label>
        </div>`).join('')}</div>
      <button class="btn" id="addPlane">+ Fläche hinzufügen</button>
    </section>

    <section class="card set-sec">
      <div class="h2" style="margin:0">App</div>
      ${installPrompt ? '<button class="btn primary" id="installBtn">Als App installieren</button>' : '<p class="hint" style="margin:0">Installieren: im Browser-Menü „Zum Startbildschirm hinzufügen“ wählen.</p>'}
      <p class="hint" style="margin:0">Private, nicht-kommerzielle App. Alle Angaben ohne Gewähr – maßgeblich sind die amtlichen Warnungen des DWD.</p>
    </section>

    <section class="card set-sec" aria-label="Quellen und Lizenzen">
      <div class="h2" style="margin:0">Quellen &amp; Lizenzen</div>
      <ul class="hint" style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px">
        <li>Wetter, Radar, Warnungen, Blitze: Quelle: <a href="https://www.dwd.de" style="color:var(--accent)">Deutscher Wetterdienst</a> (CC BY 4.0), teils verändert/umgerechnet; abgerufen über <a href="https://brightsky.dev" style="color:var(--accent)">Bright Sky</a> und den DWD-GeoServer.</li>
        <li>Vorhersagen und Modellkarten: <a href="https://open-meteo.com" style="color:var(--accent)">Wetterdaten von Open-Meteo.com</a> (CC BY 4.0, DWD-ICON-Modell).</li>
        <li>Luftqualität und Pollen: enthält veränderte Informationen des Copernicus Atmosphere Monitoring Service (CAMS); weder die EU-Kommission noch ECMWF sind für deren Verwendung verantwortlich.</li>
        <li>Satellitenbilder: © EUMETSAT (verändert: Wolkenmaske, Infrarot und sichtbarer Kanal zu Wolken und Einstrahlung umgerechnet).</li>
        <li>Karte: © OpenStreetMap-Mitwirkende (ODbL), SRTM; Darstellung © OpenTopoMap (CC BY-SA).</li>
        <li>Ortssuche: Photon von komoot, Daten © OpenStreetMap-Mitwirkende. IP-Ortung: ipwho.is.</li>
        <li>Software: Leaflet (BSD-2), proj4js (MIT), Schriften Inter und Space Grotesk (SIL OFL); Mondberechnung nach SunCalc © Vladimir Agafonkin (BSD-2). Lizenztexte im Ordner <code>mobile/vendor</code> bzw. in <code>LICENSE</code> und <code>THIRD-PARTY-NOTICES.md</code>.</li>
      </ul>
    </section>

    <section class="card set-sec" aria-label="Datenschutz">
      <div class="h2" style="margin:0">Datenschutz</div>
      <p class="hint" style="margin:0">Die App hat keinen eigenen Server, kein Konto und kein Tracking. Deine Einstellungen (Zuhause, Favoriten, PV-Flächen) werden nur in diesem Browser gespeichert.</p>
      <p class="hint" style="margin:0">Um Wetterdaten zu laden, ruft dein Gerät direkt die oben genannten Dienste ab. Dabei erhalten diese – wie bei jedem Webseitenaufruf – deine IP-Adresse und die Koordinaten der angezeigten Orte, auf etwa 1 km gerundet. Die Ortssuche überträgt den Suchbegriff an Photon, die IP-Ortung fragt ipwho.is. GPS wird nur genutzt, wenn du es erlaubst. Schriften und Programmbibliotheken werden mit der App ausgeliefert, nicht von Google oder anderen Fremdservern geladen.</p>
    </section>`;

  bindSearch($('#homeSearch'), $('#homeResults'), p => { config.home = { name: p.short, lat: p.lat, lon: p.lon }; saveCfg(); state.pv = null; toast(`Zuhause: ${p.short}`); renderMehr(); refreshMine(); });
  $('#homeHere').onclick = async () => {
    const g2 = state.geo || await locate();
    if (!g2) { toast(state.geoError || 'Standort nicht verfügbar'); return; }
    config.home = { name: 'Zuhause', lat: +g2.lat.toFixed(5), lon: +g2.lon.toFixed(5) }; saveCfg(); state.pv = null; toast('Zuhause gesetzt'); renderMehr(); refreshMine();
  };
  document.querySelectorAll('input[name=curMode]').forEach(r => r.onchange = () => setCurMode(r.value));
  if ($('#curSearch')) bindSearch($('#curSearch'), $('#curResults'), p => {
    config.current = { mode: 'manual', name: p.short, lat: p.lat, lon: p.lon }; config.active = { type: 'current' }; saveCfg(); toast(`Standort: ${p.short}`); renderMehr(); loadActive();
  });
  $('#planes').addEventListener('change', e => {
    const box = e.target.closest('.plane'), k = e.target.dataset.k; if (!box || !k) return;
    const p = config.pv.planes[+box.dataset.i], v = e.target.value.trim().replace(',', '.');
    p[k] = k === 'name' ? v : (v === '' ? null : +v); saveCfg(); state.pv = null;
  });
  $('#planes').addEventListener('click', e => {
    const del = e.target.closest('[data-del]'); if (!del) return;
    config.pv.planes.splice(+del.dataset.del, 1); saveCfg(); state.pv = null; renderMehr();
  });
  $('#addPlane').onclick = () => { config.pv.planes.push({ name: `Fläche ${config.pv.planes.length + 1}`, kwp: 1, tilt: 30, azimuth: 0, limit: null }); saveCfg(); state.pv = null; renderMehr(); };
  if ($('#installBtn')) $('#installBtn').onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; renderMehr(); };
}

async function setCurMode(mode) {
  config.current.mode = mode; config.active = { type: 'current' }; saveCfg();
  state.geo = null; state.geoName = null; state.geoError = null;
  if (state.view === 'mehr') renderMehr();
  if (mode !== 'manual') { await locate(); if (state.view === 'mehr') renderMehr(); }
  loadActive(); refreshMine();
}
window.setCurMode = setCurMode;

/* ======================= Navigation ======================= */
const wideMq = matchMedia('(min-width: 1000px)');
function showView(v) {
  if (wideMq.matches && v === 'karte') v = state.view && state.view !== 'karte' ? state.view : 'wetter';   // Karte ist breit immer sichtbar
  state.view = v;
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${v}`));
  const tab = v === 'favs' ? 'wetter' : v;
  document.querySelectorAll('#tabbar button').forEach(b => { const on = b.dataset.view === tab; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  renderLocTabs();
  if (v === 'favs') { renderFavs(); loadSummaries().then(renderFavs); }
  if (v === 'pv') renderPv();
  if (v === 'mehr') renderMehr();
  if (v === 'karte' && window.mobileMap) mobileMap.show();
}
window.showView = showView;
function refreshMine() { if (window.mobileMap?.ready) loadSummaries(true).then(() => mobileMap.drawMine()); }

/* ======================= Ziehen zum Aktualisieren ======================= */
function bindPull() {
  const sc = $('#wetterScroll'), hint = $('#pullHint');
  let y0 = null, armed = false;
  sc.addEventListener('touchstart', e => { y0 = sc.scrollTop <= 0 ? e.touches[0].clientY : null; armed = false; }, { passive: true });
  sc.addEventListener('touchmove', e => { if (y0 == null) return; armed = e.touches[0].clientY - y0 > 80; hint.classList.toggle('show', armed); }, { passive: true });
  sc.addEventListener('touchend', () => { hint.classList.remove('show'); if (armed) refreshAll(true); y0 = null; armed = false; });
}
async function refreshAll(force) {
  if (config.current.mode !== 'manual' && (force || !state.geo)) await locate();
  await loadActive(false);
  state.summaryAt = 0;
  if (window.mobileMap?.ready) mobileMap.refresh();
  if (force) toast('Aktualisiert', 1500);
}

/* ======================= Start ======================= */
async function start() {
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => showView(b.dataset.view));
  ['#locTabs', '#locTabs2'].forEach(s => $(s).addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) onLocTab(b.dataset.t); }));
  bindFavs();
  bindPull();
  renderLocTabs();
  // Breiter Bildschirm: Karte gleich mit anzeigen (und beim Umschalten auf breit nachladen)
  if (wideMq.matches) mobileMap.show();
  wideMq.addEventListener('change', e => { if (e.matches) { mobileMap.show(); if (state.view === 'karte') showView('wetter'); } });
  if (config.current.mode !== 'manual') {
    if (config.home && config.active.type === 'current') loadActive();   // schon mal etwas zeigen
    await locate();
  }
  await loadActive();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - state.loadedAt > 5 * MIN) refreshAll(false); });
  setInterval(() => { if (document.visibilityState === 'visible') refreshAll(false); }, 10 * MIN);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
}
document.addEventListener('DOMContentLoaded', start);
