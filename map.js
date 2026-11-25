'use strict';
/*
 * Animierte Wetterkarte
 *  - Hintergrund: OpenTopoMap (OpenStreetMap-Daten, SRTM; CC BY-SA)
 *  - Wolken:   „Jetzt“  -> Meteosat MTG Infrarot (EUMETSAT), in weiße Wolken umgerechnet
 *              Folgetage -> DWD ICON Gesamtbewölkung (Open-Meteo, 0,5°-Raster, interpoliert)
 *  - Niederschlag: „Jetzt“ -> DWD-Radar (Bright Sky, −2 h … +2 h), Folgetage -> ICON stündlich
 *              Schnee rosa, Regen blau (Phase aus ICON-Temperatur bzw. -Schneefall)
 *  - Wettersymbole + Temperatur für Städte (ICON über Open-Meteo)
 * Nutzt Hilfsfunktionen aus app.js (getJSON, q, MIN, fmtTime, relMin, wmo, config, …).
 */

const EUM_WMS_URL = 'https://view.eumetsat.int/geoserver/wms';
const DWD_WMS_URL = 'https://maps.dwd.de/geoserver/dwd/wms';
const GRID = { lat0: 45.5, lon0: 2, step: 0.75, nLat: 15, nLon: 23 };  // 45,5…56 °N, 2…18,5 °O (345 Punkte)

const CITIES = [ // [Name, lat, lon, Stufe] – Stufe 1 immer sichtbar, Stufe 2 ab Zoom 7
  ['Hamburg', 53.55, 9.99, 1], ['Berlin', 52.52, 13.40, 1], ['Köln', 50.94, 6.96, 1], ['München', 48.14, 11.58, 1],
  ['Frankfurt', 50.11, 8.68, 1], ['Stuttgart', 48.78, 9.18, 1], ['Dresden', 51.05, 13.74, 1], ['Hannover', 52.37, 9.73, 1],
  ['Rostock', 54.09, 12.10, 1], ['Nürnberg', 49.45, 11.08, 1], ['Erfurt', 50.98, 11.03, 1], ['Kiel', 54.32, 10.13, 1],
  ['Bremen', 53.08, 8.80, 2], ['Leipzig', 51.34, 12.37, 2], ['Magdeburg', 52.13, 11.62, 1], ['Dortmund', 51.51, 7.47, 2],
  ['Saarbrücken', 49.24, 6.99, 1], ['Freiburg', 47.99, 7.85, 1], ['Kassel', 51.31, 9.48, 1], ['Regensburg', 49.01, 12.10, 2],
  ['Konstanz', 47.66, 9.18, 2], ['Münster', 51.96, 7.63, 2], ['Aachen', 50.78, 6.08, 2], ['Schwerin', 53.63, 11.41, 2],
  ['Würzburg', 49.79, 9.95, 2], ['Passau', 48.57, 13.43, 1], ['Görlitz', 51.15, 14.99, 2], ['Oldenburg', 53.14, 8.21, 2],
  ['Koblenz', 50.36, 7.59, 2], ['Augsburg', 48.37, 10.90, 2], ['Sylt', 54.90, 8.31, 2], ['Garmisch', 47.49, 11.10, 2],
  ['Amsterdam', 52.37, 4.90, 1], ['Brüssel', 50.85, 4.35, 1], ['Paris', 48.86, 2.35, 1], ['Luxemburg', 49.61, 6.13, 2],
  ['Zürich', 47.38, 8.54, 1], ['Wien', 48.21, 16.37, 1], ['Prag', 50.08, 14.44, 1], ['Kopenhagen', 55.68, 12.57, 1],
  ['Posen', 52.41, 16.93, 1], ['Innsbruck', 47.27, 11.39, 2], ['Salzburg', 47.80, 13.04, 2], ['Straßburg', 48.57, 7.75, 2],
  ['Breslau', 51.11, 17.04, 2], ['Lille', 50.63, 3.06, 2],
];

const RAIN_COL = [[0.1, [140, 200, 255, 165]], [0.5, [80, 160, 250, 190]], [1, [35, 115, 235, 205]], [2, [20, 75, 200, 215]],
  [5, [250, 205, 30, 225]], [10, [250, 125, 20, 235]], [20, [220, 35, 35, 240]], [50, [160, 30, 180, 245]]];
const SNOW_COL = [[0.1, [255, 205, 245, 170]], [0.5, [245, 155, 225, 195]], [1, [230, 105, 205, 210]], [2, [200, 65, 185, 220]], [5, [160, 40, 165, 235]]];
const TEMP_COL = [[-20, [110, 60, 170]], [-10, [60, 90, 220]], [-5, [70, 150, 235]], [0, [130, 215, 240]], [5, [120, 210, 150]],
  [10, [170, 220, 90]], [15, [245, 220, 70]], [20, [250, 170, 50]], [25, [240, 100, 40]], [30, [200, 40, 40]], [35, [150, 20, 60]]];
const LAYERS = [
  ['clouds', '☁️', 'Wolken'], ['precip', '💧', 'Niederschlag (Regen blau, Schnee rosa)'], ['temp', '🌡️', 'Temperatur'],
  ['symbols', '⛅', 'Wettersymbole'], ['lightning', '⚡', 'Blitze (DWD)'], ['warn', '⚠️', 'Warnungen (DWD)'],
  ['wind', '🌬️', 'Wind (km/h) – Strömung und Stärke, DWD ICON'],
  ['solar', '☀️', 'Sonneneinstrahlung (W/m²) – „Jetzt“ aus Satellit, sonst DWD ICON'],
  ['sat', '🛰️', 'Satellit in Echtfarben (nur „Jetzt“)'],
];

const pack = c => ((c[3] ?? 255) << 24 | c[2] << 16 | c[1] << 8 | c[0]) >>> 0;
const palPick = (scale, v) => { let c = null; for (const [thr, rgba] of scale) if (v >= thr) c = rgba; return c; };
function tempRgb(t) {
  if (t <= TEMP_COL[0][0]) return TEMP_COL[0][1];
  for (let i = 1; i < TEMP_COL.length; i++) {
    const [t1, c1] = TEMP_COL[i];
    if (t <= t1) {
      const [t0, c0] = TEMP_COL[i - 1], f = (t - t0) / (t1 - t0);
      return [0, 1, 2].map(k => Math.round(c0[k] + (c1[k] - c0[k]) * f));
    }
  }
  return TEMP_COL[TEMP_COL.length - 1][1];
}

const mapS = {
  map: null, base: [], overlays: {}, markers: {}, cityMarkers: [], warn: null, lightning: null,
  frames: [], idx: 0, range: 'now', playing: false, timer: null, token: 0,
  radar: null, radarAt: 0, grid: null, cities: null, sat: null,
  satImg: new Map(), gridImg: new Map(),
  layers: null,
};

/* ======================= Grundkarte ======================= */
function setBasemap() {
  const map = mapS.map;
  if (!mapS.base.length) {
    // Frei lizenzierte Geländekarte: Grünflächen, Wald, Relief und Beschriftung in einer Ebene, alle Zoomstufen
    mapS.base = [
      L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc', maxNativeZoom: 17, maxZoom: 13,
        attribution: 'Karte: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, SRTM | Darstellung: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC BY-SA)',
      }).addTo(map),
    ];
  }
  mapS.base[0].getContainer().style.filter = isDark() ? 'brightness(.8) saturate(1.1)' : 'saturate(1.1)';
}

function initMap() {
  mapS.layers = Object.assign({ clouds: true, precip: true, temp: false, wind: false, solar: false, symbols: true, lightning: false, warn: false, sat: false }, config.mapLayers || {});
  const map = L.map('map', { minZoom: 4, maxZoom: 12, zoomSnap: 0.5, zoomControl: false }).setView([51.2, 10.4], 6);
  mapS.map = map;
  L.control.zoom({ position: 'topright' }).addTo(map);
  const pane = (n, z) => { const p = map.createPane(n); p.style.zIndex = z; p.style.pointerEvents = 'none'; };
  pane('temp', 330); pane('wind', 332); pane('solar', 335); pane('clouds', 340); pane('precip', 360); pane('warn', 380); pane('labels', 450);
  setBasemap();
  // Quellen der Wetterebenen (Lizenzhinweise)
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.attributionControl.addAttribution('Wetter: <a href="https://www.dwd.de">Deutscher Wetterdienst</a> (verändert), <a href="https://open-meteo.com">Open-Meteo</a> · Satellit: © <a href="https://www.eumetsat.int">EUMETSAT</a> (verändert)');
  initWindAnim();

  for (const k of ['temp', 'wind', 'solar', 'clouds', 'precip']) {
    mapS.overlays[k] = L.imageOverlay('data:image/gif;base64,R0lGODlhAQABAAAAACw=', [[0, 0], [0.1, 0.1]], { pane: k, opacity: 0, interactive: false }).addTo(map);
  }
  mapS.warn = L.tileLayer.wms(DWD_WMS_URL, { layers: 'dwd:Warnungen_Gemeinden_vereinigt', format: 'image/png', transparent: true, opacity: .55, pane: 'warn', attribution: 'Warnungen: DWD' });
  mapS.lightning = L.tileLayer.wms(DWD_WMS_URL, { layers: 'dwd:Blitzdichte', format: 'image/png', transparent: true, pane: 'warn', attribution: 'Blitze: DWD' });

  CITIES.forEach(([name, lat, lon, tier], k) => {
    const m = L.marker([lat, lon], { icon: L.divIcon({ className: 'city-wx', html: '', iconSize: [70, 26], iconAnchor: [35, 30] }), interactive: false, keyboard: false });
    m.tier = tier; m.k = k; m.cityName = name;
    mapS.cityMarkers.push(m);
  });

  new ResizeObserver(() => map.invalidateSize()).observe($('#map'));
  let t;
  map.on('moveend', () => {
    clearTimeout(t);
    t = setTimeout(() => { updateCities(mapS.frames[mapS.idx]?.t); if (mapS.range === 'now') { prefetchSat(); showFrame(mapS.idx); } }, 350);
  });
  let hv;
  map.on('mousemove', e => { if (!mapS.layers.solar) return; clearTimeout(hv); hv = setTimeout(() => { solarHover = e.latlng; updateSolarReadout(); }, 60); });
  map.on('mouseout', () => { solarHover = null; updateSolarReadout(); });
  map.on('zoomend', () => {
    updateCities(mapS.frames[mapS.idx]?.t);
    const o = mapS.overlays.clouds;
    if (o.options.opacity > 0) o.setOpacity(cloudOpacity());
  });
  bindMapUI();
  applyLayerToggles();
}

function updateMarkers() {
  const map = mapS.map;
  for (const k of Object.keys(mapS.markers)) { map.removeLayer(mapS.markers[k]); delete mapS.markers[k]; }
  const h = homeLoc(), c = currentLoc();
  if (h) mapS.markers.home = L.marker([h.lat, h.lon], { icon: L.divIcon({ html: '🏠', className: 'home-icon', iconSize: [24, 24] }), zIndexOffset: 1000 }).bindTooltip(`Zuhause: ${esc(h.name)}`).addTo(map);
  if (c) mapS.markers.cur = L.circleMarker([c.lat, c.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#2f81f7', fillOpacity: 1 }).bindTooltip(`Standort: ${esc(c.name)}`).addTo(map);
}

/* ======================= Modelldaten (Raster + Städte) ======================= */
async function loadModelData(force) {
  if (!force && mapS.grid && Date.now() - mapS.grid.at < 3 * 60 * MIN) return;
  const lats = [], lons = [];
  for (let a = 0; a < GRID.nLat; a++) for (let b = 0; b < GRID.nLon; b++) { lats.push(String(GRID.lat0 + a * GRID.step)); lons.push(String(GRID.lon0 + b * GRID.step)); }
  // Kommas nicht kodieren und in Pakete teilen, sonst wird die URL zu lang
  const om = (la, lo, extra) => getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la.join(',')}&longitude=${lo.join(',')}&models=icon_seamless&forecast_days=5&timezone=UTC&${q(extra)}`);
  const CH = 180, parts = [];
  for (let i = 0; i < lats.length; i += CH) parts.push(om(lats.slice(i, i + CH), lons.slice(i, i + CH), { cell_selection: 'nearest', hourly: 'cloud_cover,precipitation,snowfall,temperature_2m,shortwave_radiation,wind_speed_10m,wind_direction_10m' }));
  const [c, ...gp] = await Promise.all([
    om(CITIES.map(x => x[1]), CITIES.map(x => x[2]), { hourly: 'weather_code,temperature_2m,is_day' }),
    ...parts,
  ]);
  const g = gp.flat();
  const times = g[0].hourly.time.map(s => Date.parse(s + 'Z'));
  const nP = g.length, nT = times.length;
  const mk = () => Array.from({ length: nT }, () => new Float32Array(nP));
  const cc = mk(), pr = mk(), sn = mk(), t2 = mk(), sw = mk(), wu = mk(), wv = mk(), ws = mk();
  g.forEach((loc, p) => {
    const h = loc.hourly;
    for (let i = 0; i < nT; i++) {
      cc[i][p] = h.cloud_cover[i] ?? 0; pr[i][p] = h.precipitation[i] ?? 0;
      sn[i][p] = h.snowfall[i] ?? 0; t2[i][p] = h.temperature_2m[i] ?? 5;
      sw[i][p] = h.shortwave_radiation?.[i] ?? 0;   // Globalstrahlung, Mittel der vorangehenden Stunde (W/m²)
      // Wind: Richtung = woher er kommt → Strömungsvektor (wohin er weht) in km/h, Ost (u) und Nord (v)
      const spd = h.wind_speed_10m?.[i] ?? 0, dir = (h.wind_direction_10m?.[i] ?? 0) * Math.PI / 180;
      ws[i][p] = spd; wu[i][p] = -spd * Math.sin(dir); wv[i][p] = -spd * Math.cos(dir);
    }
  });
  mapS.grid = { at: Date.now(), times, cc, pr, sn, t2, sw, wu, wv, ws };
  mapS.gridImg.forEach(u => URL.revokeObjectURL(u)); mapS.gridImg.clear();
  const ct = c[0].hourly.time.map(s => Date.parse(s + 'Z'));
  mapS.cities = { times: ct, list: c.map(x => ({ code: x.hourly.weather_code, t: x.hourly.temperature_2m, day: x.hourly.is_day })) };
}

// Stundenwert gilt für die vorangehende Stunde (Summe) bzw. den Zeitpunkt -> nächste volle Stunde
const hourIdx = (times, t) => clamp(Math.round((t - times[0]) / 3600000), 0, times.length - 1);

function gridSample(arr, lat, lon) {
  const fy = (lat - GRID.lat0) / GRID.step, fx = (lon - GRID.lon0) / GRID.step;
  if (fy < 0 || fx < 0 || fy > GRID.nLat - 1 || fx > GRID.nLon - 1) return null;
  const y0 = Math.min(GRID.nLat - 2, fy | 0), x0 = Math.min(GRID.nLon - 2, fx | 0), wy = fy - y0, wx = fx - x0, n = GRID.nLon, k = y0 * n + x0;
  return (arr[k] * (1 - wx) + arr[k + 1] * wx) * (1 - wy) + (arr[k + n] * (1 - wx) + arr[k + n + 1] * wx) * wy;
}

/* ----- Rasterfelder (Wolken / Niederschlag / Temperatur) als Bild ----- */
const GR = { W: 0, H: 0, fx: null, fy: null, bounds: null, canvas: null };
function buildGridRaster() {
  if (GR.fx) return;
  const south = GRID.lat0, north = GRID.lat0 + (GRID.nLat - 1) * GRID.step, west = GRID.lon0, east = GRID.lon0 + (GRID.nLon - 1) * GRID.step;
  GR.bounds = L.latLngBounds([south, west], [north, east]);
  const crs = L.CRS.EPSG3857, sw = crs.project(L.latLng(south, west)), ne = crs.project(L.latLng(north, east));
  const W = 760, H = Math.round(W * (ne.y - sw.y) / (ne.x - sw.x));
  GR.fx = new Float32Array(W); GR.fy = new Float32Array(H);
  for (let i = 0; i < W; i++) GR.fx[i] = ((i + .5) / W * (east - west)) / GRID.step;
  for (let j = 0; j < H; j++) GR.fy[j] = (crs.unproject(L.point(sw.x, ne.y - (j + .5) / H * (ne.y - sw.y))).lat - south) / GRID.step;
  GR.W = W; GR.H = H;
  GR.canvas = document.createElement('canvas'); GR.canvas.width = W; GR.canvas.height = H;
}

async function renderGrid(kind, t) {
  const g = mapS.grid; if (!g) return null;
  buildGridRaster();
  const h = hourIdx(g.times, t), key = `${kind}:${h}:${g.at}`;
  if (!mapS.gridImg.has(key)) mapS.gridImg.set(key, (async () => {
    const ctx = GR.canvas.getContext('2d'), img = ctx.createImageData(GR.W, GR.H), px = new Uint32Array(img.data.buffer);
    const n = GRID.nLon, cc = g.cc[h], pr = g.pr[h], sn = g.sn[h], t2 = g.t2[h], swr = g.sw[h], wsp = g.ws[h];
    const lerp = (arr, k, wx, wy) => (arr[k] * (1 - wx) + arr[k + 1] * wx) * (1 - wy) + (arr[k + n] * (1 - wx) + arr[k + n + 1] * wx) * wy;
    for (let j = 0; j < GR.H; j++) {
      const fy = GR.fy[j]; if (fy < 0 || fy > GRID.nLat - 1) continue;
      const y0 = Math.min(GRID.nLat - 2, fy | 0), wy = fy - y0;
      for (let i = 0; i < GR.W; i++) {
        const fx = GR.fx[i], x0 = Math.min(GRID.nLon - 2, fx | 0), wx = fx - x0, k = y0 * n + x0;
        const fade = Math.min(1, Math.min(fx, GRID.nLon - 1 - fx, fy, GRID.nLat - 1 - fy) / 1.5);
        let c = 0;
        if (kind === 'clouds') {
          const a = clamp((lerp(cc, k, wx, wy) - 20) / 80, 0, 1);
          if (a > 0) { const s = Math.round(250 - a * 40); c = pack([s, s, Math.min(255, s + 5), Math.round(Math.pow(a, 1.1) * 235 * fade)]); }
        } else if (kind === 'precip') {
          const p = lerp(pr, k, wx, wy);
          if (p >= 0.1) {
            const snow = lerp(sn, k, wx, wy) * 0.7 >= p * 0.5;
            const col = palPick(snow ? SNOW_COL : RAIN_COL, p);
            if (col) c = pack([col[0], col[1], col[2], Math.round(col[3] * fade)]);
          }
        } else if (kind === 'wind') {
          const rgb = windRgb(lerp(wsp, k, wx, wy));
          c = pack([rgb[0], rgb[1], rgb[2], Math.round(165 * fade)]);
        } else if (kind === 'solar') {
          const col = solarRgba(lerp(swr, k, wx, wy));
          if (col) c = pack([col[0], col[1], col[2], Math.round(col[3] * fade)]);
        } else {
          const rgb = tempRgb(lerp(t2, k, wx, wy));
          c = pack([rgb[0], rgb[1], rgb[2], Math.round(150 * fade)]);
        }
        if (c) px[j * GR.W + i] = c;
      }
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise(r => GR.canvas.toBlob(r, 'image/png'));
    return URL.createObjectURL(blob);
  })());
  return { url: await mapS.gridImg.get(key), bounds: GR.bounds };
}

/* ======================= Radar (DWD RV über Bright Sky) ======================= */
const RADOLAN_PROJ = '+proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +a=6378137 +b=6356752.3142451802 +no_defs +x_0=543196.83521776402 +y_0=3622588.8619310018';
const RAD = { W: 1100, H: 1200, lut: null, outW: 0, outH: 0, bounds: null, lat: null, lon: null, rainPal: null, snowPal: null };

function buildRadarLut() {
  if (RAD.lut) return;
  const south = 45.6, north = 55.95, west = 1.4, east = 18.85;
  RAD.bounds = L.latLngBounds([south, west], [north, east]);
  const crs = L.CRS.EPSG3857, sw = crs.project(L.latLng(south, west)), ne = crs.project(L.latLng(north, east));
  const outW = 1100, outH = Math.round(outW * (ne.y - sw.y) / (ne.x - sw.x));
  const toStere = proj4('EPSG:4326', RADOLAN_PROJ);
  const S = 8, gw = Math.ceil(outW / S) + 1, gh = Math.ceil(outH / S) + 1;
  const gx = new Float64Array(gw * gh), gy = new Float64Array(gw * gh);
  for (let b = 0; b < gh; b++) {
    const my = ne.y - (b * S + 0.5) * (ne.y - sw.y) / outH;
    for (let a = 0; a < gw; a++) {
      const ll = crs.unproject(L.point(sw.x + (a * S + 0.5) * (ne.x - sw.x) / outW, my));
      const [x, y] = toStere.forward([ll.lng, ll.lat]);
      gx[b * gw + a] = x; gy[b * gw + a] = y;
    }
  }
  const lut = new Int32Array(outW * outH);
  for (let j = 0; j < outH; j++) {
    const b = Math.floor(j / S), fb = (j - b * S) / S;
    for (let i = 0; i < outW; i++) {
      const a = Math.floor(i / S), fa = (i - a * S) / S, k = b * gw + a;
      const x = (gx[k] * (1 - fa) + gx[k + 1] * fa) * (1 - fb) + (gx[k + gw] * (1 - fa) + gx[k + gw + 1] * fa) * fb;
      const y = (gy[k] * (1 - fa) + gy[k + 1] * fa) * (1 - fb) + (gy[k + gw] * (1 - fa) + gy[k + gw + 1] * fa) * fb;
      const col = Math.floor((x + 500) / 1000), row = Math.floor((500 - y) / 1000);
      lut[j * outW + i] = col >= 0 && col < RAD.W && row >= 0 && row < RAD.H ? row * RAD.W + col : -1;
    }
  }
  RAD.lon = new Float32Array(outW); RAD.lat = new Float32Array(outH);
  for (let i = 0; i < outW; i++) RAD.lon[i] = west + (i + .5) / outW * (east - west);
  for (let j = 0; j < outH; j++) RAD.lat[j] = crs.unproject(L.point(sw.x, ne.y - (j + .5) / outH * (ne.y - sw.y))).lat;
  const mkPal = scale => { const p = new Uint32Array(4096); for (let v = 0; v < 4096; v++) { const c = palPick(scale, v * 0.12); p[v] = c ? pack(c) : 0; } return p; };
  Object.assign(RAD, { lut, outW, outH, rainPal: mkPal(RAIN_COL), snowPal: mkPal(SNOW_COL) });
}

async function inflateB64(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint16Array(await new Response(stream).arrayBuffer());
}

async function loadRadar() {
  buildRadarLut();
  const now = Date.now();
  const from = new Date(Math.floor((now - 120 * MIN) / (5 * MIN)) * 5 * MIN).toISOString();
  const data = await getJSON(`https://api.brightsky.dev/radar?${q({ date: from, last_date: new Date(now + 130 * MIN).toISOString(), format: 'compressed' })}`);
  const canvas = document.createElement('canvas'); canvas.width = RAD.outW; canvas.height = RAD.outH;
  const ctx = canvas.getContext('2d'), g = mapS.grid;
  const frames = [];
  for (const fr of data.radar) {
    const raw = await inflateB64(fr.precipitation_5);
    const t = Date.parse(fr.timestamp);
    const T = g ? g.t2[hourIdx(g.times, t)] : null;
    const img = ctx.createImageData(RAD.outW, RAD.outH), px = new Uint32Array(img.data.buffer), lut = RAD.lut, W = RAD.outW;
    for (let p = 0; p < lut.length; p++) {
      const k = lut[p]; if (k < 0) continue;
      const v = raw[k]; if (!v) continue;
      let snow = false;
      if (T) { const j = (p / W) | 0, temp = gridSample(T, RAD.lat[j], RAD.lon[p - j * W]); snow = temp != null && temp <= 0.8; }
      px[p] = (snow ? RAD.snowPal : RAD.rainPal)[v > 4095 ? 4095 : v];
    }
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const analysis = Date.parse((fr.source || '').split('::')[2] || '') || 0;
    frames.push({ t, url: URL.createObjectURL(blob), forecast: !!analysis && t > analysis });
  }
  (mapS.radar || []).forEach(f => URL.revokeObjectURL(f.url));
  mapS.radar = frames; mapS.radarAt = Date.now();
}

/* ======================= Satellit (EUMETSAT MTG) ======================= */
const SAT_SRC = {   // Wolkenmaske (MSG, 15 min), Infrarot (MTG, 10 min), Echtfarben (MTG, 10 min)
  clm: { ws: 'msg_fes', layer: 'clm' }, ir: { ws: 'mtg_fd', layer: 'ir105_hrfi' }, vis: { ws: 'mtg_fd', layer: 'vis06_hrfi' },
  color: { ws: 'mtg_fd', layer: 'rgb_geocolour' },
};
async function loadSatTimes() {
  mapS.sat = {};
  await Promise.all(Object.entries(SAT_SRC).map(async ([k, s]) => {
    const txt = await (await fetch(`https://view.eumetsat.int/geoserver/${s.ws}/${s.layer}/ows?service=WMS&version=1.3.0&request=GetCapabilities`)).text();
    const m = /<Dimension[^>]*name="time"[^>]*>([^<]+)<\/Dimension>/.exec(txt);
    const [, end, per] = m[1].trim().split(',').pop().split('/');
    mapS.sat[k] = { latest: Date.parse(end), period: /PT(\d+)M/.exec(per) ? +/PT(\d+)M/.exec(per)[1] * MIN : 15 * MIN };
  }));
}
function satTimeFor(t, k = 'clm') {
  const s = mapS.sat?.[k]; if (!s) return null;
  return Math.min(s.latest, Math.floor(t / s.period) * s.period);
}
function satUrl(k, t, b, w, h) {
  const sw = L.CRS.EPSG3857.project(b.getSouthWest()), ne = L.CRS.EPSG3857.project(b.getNorthEast());
  return `${EUM_WMS_URL}?${q({
    service: 'WMS', version: '1.3.0', request: 'GetMap', layers: `${SAT_SRC[k].ws}:${SAT_SRC[k].layer}`, styles: '', crs: 'EPSG:3857',
    bbox: [sw.x, sw.y, ne.x, ne.y].map(v => v.toFixed(0)).join(','), width: w, height: h,
    format: 'image/png', transparent: 'true', time: new Date(t).toISOString(),
  })}`;
}
async function fetchPixels(url) {
  const blob = await (await fetch(url)).blob();
  if (!blob.type.startsWith('image/')) throw new Error('kein Bild');
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
  return { c, ctx, img: ctx.getImageData(0, 0, c.width, c.height) };
}
function satImage(t, color) {
  const kind = color ? 'color' : 'clm';
  const st = satTimeFor(t, kind); if (st == null) return Promise.resolve(null);
  const map = mapS.map, b = map.getBounds(), size = map.getSize(), f = color ? 1 : 0.6;
  const w = Math.round(size.x * f), h = Math.round(size.y * f);
  const url = satUrl(kind, st, b, w, h);
  if (!mapS.satImg.has(url)) {
    const p = (async () => {
      if (color) {
        const blob = await (await fetch(url)).blob();
        if (!blob.type.startsWith('image/')) throw new Error('kein Bild');
        return URL.createObjectURL(blob);
      }
      // Die Wolkenmaske sagt nur, WO Wolken sind (Rot-Kanal: 255 = Wolke, 0 = wolkenfrei) – auch dünne
      // Schleier zählen dort als „Wolke“. WIE DICHT sie sind, kommt
      //   tagsüber aus dem sichtbaren Kanal (Helligkeit, auf den Sonnenstand normiert),
      //   nachts / in der Dämmerung aus dem Infrarot (kalte, dicke Wolken = hell).
      // Eichung (MTG VIS 0,6, Mittag Ende Nov., Sonnenhöhe ~19°): wolkenfrei ~43, Wolken 55 (dünn) … 90+ (dick).
      const irT = satTimeFor(t, 'ir'), visT = satTimeFor(t, 'vis');
      const [m, ir, vis] = await Promise.all([
        fetchPixels(url),
        irT != null ? fetchPixels(satUrl('ir', irT, b, w, h)).catch(() => null) : Promise.resolve(null),
        visT != null ? fetchPixels(satUrl('vis', visT, b, w, h)).catch(() => null) : Promise.resolve(null),
      ]);
      const d = m.img.data, W = m.c.width, H = m.c.height;
      const di = ir && ir.img.data.length === d.length ? ir.img.data : null;
      const dv = vis && vis.img.data.length === d.length ? vis.img.data : null;
      const { A, B, C } = sunGrid(visT ?? st, b, W, H);
      const cov = new Float32Array(W * H);          // effektive Bewölkung 0…1 je Bildpunkt (für die Einstrahlung)
      for (let p = 0, i = 0; i < d.length; i += 4, p++) {
        const cloud = d[i + 3] ? d[i] / 255 : 0;
        if (!cloud) { d[i + 3] = 0; continue; }
        const y = (p / W) | 0, mu = A[y] + B[y] * C[p - y * W];
        let op = 0.25 + 0.6 * (di && di[i + 3] ? clamp((di[i] - 78) / 45, 0, 1) : 0.3);   // Nacht: aus Infrarot
        if (dv && dv[i + 3] && mu > 0.08) {
          const dayOp = clamp((dv[i] * 0.33 / Math.max(mu, 0.12) - 48) / 52, 0, 1);       // Tag: aus Helligkeit
          const wDay = clamp((mu - 0.08) / 0.12, 0, 1);
          op = wDay * dayOp + (1 - wDay) * op;
        }
        cov[p] = cloud * op;
        const s = Math.round(200 + op * 55);
        d[i] = s; d[i + 1] = s; d[i + 2] = Math.min(255, s + 5);
        d[i + 3] = Math.round(cloud * (0.1 + 0.85 * op) * 255);
      }
      m.ctx.putImageData(m.img, 0, 0);
      const c2 = document.createElement('canvas'); c2.width = m.c.width; c2.height = m.c.height;
      const x2 = c2.getContext('2d'); x2.filter = 'blur(1.2px)'; x2.drawImage(m.c, 0, 0);   // weichere Wolkenränder
      return { url: URL.createObjectURL(await new Promise(r => c2.toBlob(r, 'image/png'))), cov, W, H, b };
    })();
    p.catch(() => mapS.satImg.delete(url));
    mapS.satImg.set(url, p);
    if (mapS.satImg.size > 80) { const [k, v] = mapS.satImg.entries().next().value; mapS.satImg.delete(k); v.then(o => URL.revokeObjectURL(o.url)).catch(() => {}); }
  }
  return mapS.satImg.get(url).then(o => ({ url: o.url, bounds: b, field: o }));
}

/* ======================= Sonneneinstrahlung ======================= */
// Sonnenstand je Bildpunkt eines Kartenausschnitts: cos(Zenitwinkel) = A[Zeile] + B[Zeile]·C[Spalte]
function sunGrid(t, b, W, H) {
  const rad = Math.PI / 180, td = new Date(t);
  const doy = (Date.UTC(td.getUTCFullYear(), td.getUTCMonth(), td.getUTCDate()) - Date.UTC(td.getUTCFullYear(), 0, 0)) / 864e5;
  const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (doy + 10)) * rad, hrs = td.getUTCHours() + td.getUTCMinutes() / 60;
  const crs = L.CRS.EPSG3857, psw = crs.project(b.getSouthWest()), pne = crs.project(b.getNorthEast());
  const A = new Float32Array(H), B = new Float32Array(H), C = new Float32Array(W);
  for (let j = 0; j < H; j++) {
    const la = crs.unproject(L.point(psw.x, pne.y - (j + .5) / H * (pne.y - psw.y))).lat * rad;
    A[j] = Math.sin(la) * Math.sin(decl); B[j] = Math.cos(la) * Math.cos(decl);
  }
  for (let i = 0; i < W; i++) {
    const lo = crs.unproject(L.point(psw.x + (i + .5) / W * (pne.x - psw.x), psw.y)).lng;
    C[i] = Math.cos((hrs + lo / 15 - 12) * 15 * rad);
  }
  return { A, B, C };
}
// Globalstrahlung bei wolkenlosem Himmel (Haurwitz-Modell), W/m²
const clearSkyGhi = mu => mu > 0.01 ? 1098 * mu * Math.exp(-0.057 / mu) : 0;
// Abschwächung durch Wolken (angelehnt an Kasten & Czeplak): dichte Wolken lassen ~20–25 % durch
const cloudTrans = cov => 1 - 0.78 * Math.pow(cov, 1.4);

const SOLAR_COL = [[0, [40, 20, 70, 0]], [20, [70, 30, 120, 110]], [100, [135, 40, 130, 150]], [200, [200, 65, 90, 165]],
  [350, [240, 120, 40, 175]], [500, [250, 180, 40, 185]], [700, [255, 225, 90, 190]], [900, [255, 250, 190, 195]]];
function solarRgba(v) {
  if (v <= 0) return null;
  for (let i = 1; i < SOLAR_COL.length; i++) {
    const [v1, c1] = SOLAR_COL[i];
    if (v <= v1) { const [v0, c0] = SOLAR_COL[i - 1], f = (v - v0) / (v1 - v0); return c0.map((x, k) => Math.round(x + (c1[k] - x) * f)); }
  }
  return SOLAR_COL[SOLAR_COL.length - 1][1];
}

// „Jetzt“: Einstrahlung aus Satellit = Klarhimmel(Sonnenstand zur Bildzeit) × Wolkendurchlässigkeit
const solarImg = new Map();
async function solarSat(t) {
  const r = await satImage(t, false);
  if (!r?.field?.cov) return null;
  const fld = r.field, tt = Math.round(t / (5 * MIN)) * 5 * MIN, key = `${r.url}|${tt}`;
  if (!solarImg.has(key)) {
    solarImg.set(key, (async () => {
      const { W, H, cov } = fld, { A, B, C } = sunGrid(tt, fld.b, W, H);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), px = new Uint32Array(img.data.buffer);
      const ghi = new Float32Array(W * H);
      for (let p = 0; p < W * H; p++) {
        const y = (p / W) | 0, mu = A[y] + B[y] * C[p - y * W];
        const v = clearSkyGhi(mu) * cloudTrans(cov[p]);
        ghi[p] = v;
        const col = solarRgba(v); if (col) px[p] = pack(col);
      }
      ctx.putImageData(img, 0, 0);
      return { url: URL.createObjectURL(await new Promise(res => c.toBlob(res, 'image/png'))), ghi, W, H, b: fld.b };
    })());
    if (solarImg.size > 60) { const [k, v] = solarImg.entries().next().value; solarImg.delete(k); v.then(o => URL.revokeObjectURL(o.url)).catch(() => {}); }
  }
  const o = await solarImg.get(key);
  mapS.solarField = { kind: 'sat', ...o };
  return { url: o.url, bounds: o.b };
}

// Wert unter dem Mauszeiger (W/m²)
function solarValueAt(latlng) {
  const f = mapS.solarField; if (!f) return null;
  if (f.kind === 'grid') return gridSample(f.arr, latlng.lat, latlng.lng);
  const crs = L.CRS.EPSG3857, p = crs.project(latlng), sw = crs.project(f.b.getSouthWest()), ne = crs.project(f.b.getNorthEast());
  const i = Math.floor((p.x - sw.x) / (ne.x - sw.x) * f.W), j = Math.floor((ne.y - p.y) / (ne.y - sw.y) * f.H);
  return i >= 0 && j >= 0 && i < f.W && j < f.H ? f.ghi[j * f.W + i] : null;
}
function prefetchSat() {
  if (mapS.range !== 'now' || !(mapS.layers.clouds || mapS.layers.solar) || !mapS.sat) return;
  const color = mapS.layers.sat && mapS.layers.clouds;
  const ts = [...new Set(mapS.frames.map(f => satTimeFor(f.t, color ? 'color' : 'clm')))];
  (async () => {
    for (const t of ts) { try { await satImage(t, color); if (color && mapS.layers.solar) await satImage(t, false); } catch { /* nächster */ } }
  })();
}

/* ======================= Wind: Farbfläche + animierte Strömungslinien ======================= */
const WIND_COL = [[0, [45, 75, 150]], [10, [50, 135, 205]], [20, [55, 185, 170]], [30, [120, 200, 90]], [40, [225, 210, 70]],
  [55, [245, 150, 50]], [70, [225, 70, 60]], [90, [170, 40, 140]], [120, [110, 20, 110]]];
function windRgb(v) {
  if (!(v > 0)) return WIND_COL[0][1];
  for (let i = 1; i < WIND_COL.length; i++) {
    const [v1, c1] = WIND_COL[i];
    if (v <= v1) { const [v0, c0] = WIND_COL[i - 1], f = (v - v0) / (v1 - v0); return [0, 1, 2].map(k => Math.round(c0[k] + (c1[k] - c0[k]) * f)); }
  }
  return WIND_COL[WIND_COL.length - 1][1];
}
const WIND_DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

const windAnim = {
  canvas: null, ctx: null, t: null, hIdx: -1, field: null, parts: [], raf: 0, paused: false, dpr: 1,

  setTime(t) {
    this.t = t;
    if (t == null || !mapS.grid) { this.stop(); return; }
    const h = hourIdx(mapS.grid.times, t);
    if (h !== this.hIdx || !this.field) { this.hIdx = h; this.buildField(); }
    if (!this.raf && !this.paused) this.start();
    updateWindReadout();
  },

  // Geschwindigkeitsfeld in Bildschirmkoordinaten (alle 10 px), aus dem Modellraster interpoliert
  buildField() {
    const g = mapS.grid, map = mapS.map;
    if (!g || this.hIdx < 0) { this.field = null; return; }
    const size = map.getSize(), S = 10, cols = Math.ceil(size.x / S) + 1, rows = Math.ceil(size.y / S) + 1;
    const u = new Float32Array(cols * rows), v = new Float32Array(cols * rows), U = g.wu[this.hIdx], V = g.wv[this.hIdx];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const ll = map.containerPointToLatLng([i * S, j * S]);
      const uu = gridSample(U, ll.lat, ll.lng), vv = gridSample(V, ll.lat, ll.lng);
      u[j * cols + i] = uu == null ? NaN : uu; v[j * cols + i] = vv == null ? NaN : vv;
    }
    this.field = { S, cols, rows, u, v, w: size.x, h: size.y };
    this.resize();
  },

  vel(x, y) {
    const f = this.field, fx = x / f.S, fy = y / f.S, i = fx | 0, j = fy | 0;
    if (i < 0 || j < 0 || i >= f.cols - 1 || j >= f.rows - 1) return null;
    const a = fx - i, b = fy - j, k = j * f.cols + i, c = f.cols;
    const u = (f.u[k] * (1 - a) + f.u[k + 1] * a) * (1 - b) + (f.u[k + c] * (1 - a) + f.u[k + c + 1] * a) * b;
    const v = (f.v[k] * (1 - a) + f.v[k + 1] * a) * (1 - b) + (f.v[k + c] * (1 - a) + f.v[k + c + 1] * a) * b;
    if (Number.isNaN(u) || Number.isNaN(v)) return null;
    const K = 0.045;                            // km/h → Bildpunkte je Bild (rein optisch)
    return [u * K, -v * K];                     // Bildschirm-y zeigt nach unten
  },

  spawn(p) {
    p.x = Math.random() * this.field.w; p.y = Math.random() * this.field.h;
    p.age = 0; p.max = 50 + Math.random() * 60;
    return p;
  },

  resize() {
    const f = this.field; if (!f || !this.canvas) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = f.w * this.dpr; this.canvas.height = f.h * this.dpr;
    this.canvas.style.width = `${f.w}px`; this.canvas.style.height = `${f.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const n = clamp(Math.round(f.w * f.h / 380), 250, 2600);
    this.parts = Array.from({ length: n }, () => this.spawn({}));
    this.parts.forEach(p => { p.age = Math.random() * p.max; });
  },

  start() {
    if (!this.field || this.raf || document.hidden) return;
    this.canvas.style.display = 'block';
    const step = () => {
      this.raf = 0;
      if (!this.field || this.paused || mapS.layers.wind !== true || document.hidden) return;
      const c = this.ctx, f = this.field;
      c.globalCompositeOperation = 'destination-in';      // alte Spuren langsam ausblenden
      c.fillStyle = 'rgba(0,0,0,0.92)'; c.fillRect(0, 0, f.w, f.h);
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.1; c.beginPath();
      for (const p of this.parts) {
        const d = p.age > p.max ? null : this.vel(p.x, p.y);
        if (!d) { this.spawn(p); continue; }
        const nx = p.x + d[0], ny = p.y + d[1];
        c.moveTo(p.x, p.y); c.lineTo(nx, ny);
        p.x = nx; p.y = ny; p.age++;
      }
      c.stroke();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  },

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.ctx && this.field) this.ctx.clearRect(0, 0, this.field.w, this.field.h);
    if (this.canvas) this.canvas.style.display = 'none';
  },
};

function initWindAnim() {
  const map = mapS.map, cv = document.createElement('canvas');
  cv.className = 'wind-canvas';
  cv.style.cssText = 'position:absolute;left:0;top:0;z-index:420;pointer-events:none;display:none';
  map.getContainer().appendChild(cv);
  windAnim.canvas = cv; windAnim.ctx = cv.getContext('2d');
  const pause = () => { windAnim.paused = true; windAnim.stop(); };
  const resume = () => {
    windAnim.paused = false;
    if (mapS.layers.wind && windAnim.t != null) { windAnim.buildField(); windAnim.start(); }
  };
  map.on('movestart zoomstart', pause);
  map.on('moveend zoomend resize', resume);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  map.on('mousemove', e => { if (mapS.layers.wind) { windHover = e.latlng; updateWindReadout(); } });
  map.on('mouseout', () => { windHover = null; updateWindReadout(); });
}

// Wind am Zuhause/Standort bzw. unter dem Mauszeiger
let windHover = null;
function updateWindReadout() {
  const el = $('#windCursor'); if (!el) return;
  const g = mapS.grid;
  if (!mapS.layers.wind || !g || windAnim.hIdx < 0) { el.textContent = ''; return; }
  const ref = windHover ? ['unter Zeiger', windHover] : homeLoc() ? ['Zuhause', L.latLng(homeLoc().lat, homeLoc().lon)]
    : currentLoc() ? ['Standort', L.latLng(currentLoc().lat, currentLoc().lon)] : null;
  if (!ref) { el.textContent = ''; return; }
  const h = windAnim.hIdx, u = gridSample(g.wu[h], ref[1].lat, ref[1].lng), v = gridSample(g.wv[h], ref[1].lat, ref[1].lng);
  if (u == null) { el.textContent = ''; return; }
  const spd = Math.hypot(u, v), from = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
  el.textContent = `🌬 ${ref[0]}: ${Math.round(spd)} km/h aus ${WIND_DIRS[Math.round(from / 45) % 8]}`;
}

/* ======================= Zeitleiste ======================= */
function dayStart(k) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + k); return d.getTime(); }

function buildFrames() {
  const now = Date.now();
  if (mapS.range === 'now') {
    mapS.frames = (mapS.radar || []).map(f => ({ t: f.t, kind: f.forecast ? 'fc' : 'obs', radar: f }));
    if (!mapS.frames.length) for (let t = Math.floor((now - 120 * MIN) / (5 * MIN)) * 5 * MIN; t <= now + 120 * MIN; t += 5 * MIN) mapS.frames.push({ t, kind: t > now ? 'fc' : 'obs' });
  } else {
    const k = +mapS.range.slice(1);
    const from = k === 0 ? Math.floor(now / 3600000) * 3600000 : dayStart(k), to = dayStart(k + 1);
    mapS.frames = [];
    for (let t = from; t < to; t += 3600000) mapS.frames.push({ t, kind: 'model' });
    if (!mapS.frames.length) mapS.frames.push({ t: from, kind: 'model' });
  }
  const sl = $('#timeSlider'); sl.max = mapS.frames.length - 1;
}

function defaultFrame() {
  if (mapS.range === 'now') { const i = mapS.frames.findIndex(f => f.kind === 'fc'); return i < 0 ? mapS.frames.length - 1 : Math.max(0, i - 1); }
  if (mapS.range === 'd0') return 0;
  const i = mapS.frames.findIndex(f => new Date(f.t).getHours() === 12);
  return i < 0 ? 0 : i;
}

async function setRange(r, keepIdx) {
  stopPlay();
  mapS.range = r;
  renderRangeTabs();
  renderLegend();
  buildFrames();
  mapS.idx = keepIdx ? clamp(mapS.idx, 0, mapS.frames.length - 1) : defaultFrame();
  $('#modeTitle').textContent = r === 'now'
    ? 'Jetzt: DWD-Niederschlagsradar (letzte 2 Std. + 2-Std.-Vorhersage, 5 Min.) · Wolken: Meteosat MTG Infrarot (EUMETSAT) · Symbole: DWD ICON'
    : 'Vorhersage: DWD-ICON-Modell (über Open-Meteo), stündlich – Wolken, Niederschlag, Temperatur und Symbole';
  prefetchSat();
  await showFrame(mapS.idx);
}

function renderRangeTabs() {
  const tabs = [['now', 'Jetzt'], ['d0', 'Heute'], ['d1', 'Morgen'],
    ['d2', new Date(dayStart(2)).toLocaleDateString(de, { weekday: 'short' }).replace('.', '')],
    ['d3', new Date(dayStart(3)).toLocaleDateString(de, { weekday: 'short' }).replace('.', '')]];
  $('#rangeTabs').innerHTML = tabs.map(([k, n]) => `<button data-r="${k}" class="${k === mapS.range ? 'on' : ''}">${n}</button>`).join('');
}

/* ======================= Anzeige ======================= */
async function showFrame(i) {
  const f = mapS.frames[i]; if (!f) return;
  mapS.idx = i;
  $('#timeSlider').value = i;
  const d = new Date(f.t);
  $('#mcTime').textContent = fmtTime(f.t);
  $('#mcDate').textContent = `${d.toLocaleDateString(de, { weekday: 'short', day: '2-digit', month: '2-digit' })} · ${relMin(f.t)}`;
  const badge = $('#frameBadge');
  const [txt, cls] = f.kind === 'obs' ? ['Messung', 'obs'] : f.kind === 'fc' ? ['Radar-Vorhersage', 'fc'] : ['Modell', 'model'];
  badge.textContent = txt; badge.className = `badge ${cls}`;
  // Datenstand der Wolken anzeigen (Satellitenbilder sind 15–40 Min. alt)
  const satT = mapS.range === 'now' && (mapS.layers.clouds || mapS.layers.solar) ? satTimeFor(f.t, mapS.layers.sat && mapS.layers.clouds ? 'color' : 'clm') : null;
  $('#mcSrc').textContent = satT != null ? `🛰 Satellit ${fmtTime(satT)} Uhr${f.t - satT > 20 * MIN ? ' (letztes Bild)' : ''}` : '';
  updateCities(f.t);

  const tok = ++mapS.token, Ly = mapS.layers, now = mapS.range === 'now';
  const safe = p => p ? p.catch(() => null) : Promise.resolve(null);
  const jobs = {
    temp: Ly.temp ? safe(renderGrid('temp', f.t)) : null,
    wind: Ly.wind ? safe(renderGrid('wind', f.t)) : null,
    clouds: Ly.clouds
      ? (now ? safe(satImage(f.t, Ly.sat)).then(r => r || safe(renderGrid('clouds', f.t))) : safe(renderGrid('clouds', f.t)))
      : null,
    precip: Ly.precip ? (now ? Promise.resolve(f.radar ? { url: f.radar.url, bounds: RAD.bounds } : null) : safe(renderGrid('precip', f.t))) : null,
    solar: Ly.solar
      ? (now ? safe(solarSat(f.t)) : Promise.resolve(null)).then(r => r || (mapS.grid ? (
          mapS.solarField = { kind: 'grid', arr: mapS.grid.sw[hourIdx(mapS.grid.times, f.t)] },
          safe(renderGrid('solar', f.t))) : null))
      : null,
  };
  $('#frameLoad').textContent = '…';
  const res = {};
  for (const k of Object.keys(jobs)) res[k] = jobs[k] ? await jobs[k] : null;
  if (tok !== mapS.token) return;
  $('#frameLoad').textContent = '';
  const opac = { temp: 1, wind: 1, solar: 1, clouds: cloudOpacity(), precip: 1 };
  if (!Ly.solar) mapS.solarField = null;
  updateSolarReadout();
  windAnim.setTime(Ly.wind ? f.t : null);
  for (const k of ['temp', 'wind', 'solar', 'clouds', 'precip']) {
    const o = mapS.overlays[k], r = res[k];
    if (!r) { o.setOpacity(0); continue; }
    o.setBounds(r.bounds); o.setUrl(r.url); o.setOpacity(opac[k]);
  }
}

// beim Hineinzoomen Wolken durchsichtiger, damit die Detailkarte sichtbar bleibt (Echtfarben-Satellit ausgenommen)
const cloudOpacity = () => mapS.layers.sat && mapS.range === 'now' ? 1 : (mapS.map.getZoom() >= 9 ? 0.4 : 1);

function updateCities(t) {
  const map = mapS.map, c = mapS.cities;
  const show = mapS.layers.symbols && c && t != null, z = map.getZoom();
  const h = c ? hourIdx(c.times, t ?? Date.now()) : 0;
  for (const m of mapS.cityMarkers) {
    const vis = show && (m.tier === 1 ? z >= 5 : z >= 7);
    if (!vis) { if (map.hasLayer(m)) m.remove(); continue; }
    if (!map.hasLayer(m)) m.addTo(map);
    const x = c.list[m.k];
    const [e] = wmo(x.code[h], x.day[h]);
    const el = m.getElement();
    if (el) { el.innerHTML = `<span class="e">${e}</span><span class="t">${Math.round(x.t[h])}°</span>`; el.title = m.cityName; }
  }
}

function renderLegend() {
  const parts = [];
  if (mapS.layers.clouds && !(mapS.layers.sat && mapS.range === 'now')) {
    parts.push(`<div class="row"><span class="lbl">Wolken</span><span class="cl-grad"></span><span class="cl-txt">dünn → dicht</span></div>`);
  }
  const sw = (scale, lbl) => `<div class="row"><span class="lbl">${lbl}</span>${scale.map(([, c]) => `<i style="background:rgb(${c[0]},${c[1]},${c[2]})"></i>`).join('')}</div>`;
  if (mapS.layers.precip) parts.push(sw(RAIN_COL, 'Regen'), sw(SNOW_COL, 'Schnee'));
  if (mapS.layers.temp) parts.push(`<div class="row"><span class="lbl">°C</span>${[-10, -5, 0, 5, 10, 15, 20, 25, 30].map(t => { const c = tempRgb(t); return `<i title="${t}°" style="background:rgb(${c})">${t}</i>`; }).join('')}</div>`);
  if (mapS.layers.wind) {
    parts.push(`<div class="row"><span class="lbl">km/h</span>${[0, 10, 20, 30, 40, 55, 70, 90].map(v => { const c = windRgb(v); return `<i title="${v} km/h" style="background:rgb(${c})">${v}</i>`; }).join('')}</div>`);
    parts.push('<div class="row" id="windCursor"></div>');
  }
  if (mapS.layers.solar) {
    parts.push(`<div class="row"><span class="lbl">W/m²</span>${[50, 100, 200, 350, 500, 700, 900].map(v => { const c = solarRgba(v); return `<i title="${v} W/m²" style="background:rgb(${c[0]},${c[1]},${c[2]})">${v}</i>`; }).join('')}</div>`);
    parts.push('<div class="row" id="solarCursor"></div>');
  }
  const el = $('#mcLegend'); el.innerHTML = parts.join(''); el.hidden = !parts.length;
  updateSolarReadout();
}

// Einstrahlung am Zuhause/Standort bzw. unter dem Mauszeiger anzeigen
let solarHover = null;
function updateSolarReadout() {
  const el = $('#solarCursor'); if (!el) return;
  if (!mapS.layers.solar || !mapS.solarField) { el.textContent = ''; return; }
  const ref = solarHover ? ['unter Zeiger', solarHover] : homeLoc() ? ['Zuhause', L.latLng(homeLoc().lat, homeLoc().lon)]
    : currentLoc() ? ['Standort', L.latLng(currentLoc().lat, currentLoc().lon)] : null;
  if (!ref) { el.textContent = ''; return; }
  const v = solarValueAt(ref[1]);
  el.textContent = v == null ? '' : `☀ ${ref[0]}: ${Math.round(Math.max(0, v))} W/m²${mapS.solarField.kind === 'sat' ? ' (Satellit)' : ' (Modell)'}`;
}

function applyLayerToggles() {
  const Ly = mapS.layers, map = mapS.map;
  document.querySelectorAll('#layerButtons button').forEach(b => b.classList.toggle('on', !!Ly[b.dataset.l]));
  Ly.warn ? mapS.warn.addTo(map) : map.removeLayer(mapS.warn);
  Ly.lightning ? mapS.lightning.addTo(map) : map.removeLayer(mapS.lightning);
  renderLegend();
}

/* ======================= Abspielen ======================= */
function play() {
  mapS.playing = true; $('#btnPlay').textContent = '⏸';
  const tick = async () => {
    if (!mapS.playing) return;
    const n = mapS.frames.length, j = (mapS.idx + 1) % n;
    await showFrame(j);
    if (!mapS.playing) return;
    mapS.timer = setTimeout(tick, j === n - 1 ? 1500 : (mapS.range === 'now' ? 280 : 550));
  };
  tick();
}
function stopPlay() { mapS.playing = false; clearTimeout(mapS.timer); const b = $('#btnPlay'); if (b) b.textContent = '▶'; }
const stepFrame = d => { stopPlay(); showFrame(clamp(mapS.idx + d, 0, mapS.frames.length - 1)); };

function bindMapUI() {
  $('#layerButtons').innerHTML = LAYERS.map(([k, e, t]) => `<button data-l="${k}" title="${esc(t)}">${e}</button>`).join('');
  $('#layerButtons').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.l;
    mapS.layers[k] = !mapS.layers[k];
    if (k === 'sat' && mapS.layers.sat) mapS.layers.clouds = true;
    // Farbflächen schließen sich gegenseitig aus, damit die Farben lesbar bleiben
    if (k === 'solar' && mapS.layers.solar) { mapS.layers.clouds = false; mapS.layers.temp = false; mapS.layers.wind = false; }
    if (k === 'wind' && mapS.layers.wind) { mapS.layers.clouds = false; mapS.layers.temp = false; mapS.layers.solar = false; }
    if (k === 'temp' && mapS.layers.temp) { mapS.layers.wind = false; mapS.layers.solar = false; }
    config.mapLayers = mapS.layers; saveCfg();
    applyLayerToggles();
    if (k === 'sat') prefetchSat();
    if (k !== 'warn' && k !== 'lightning') showFrame(mapS.idx);
  });
  renderRangeTabs();
  $('#rangeTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setRange(b.dataset.r); });
  $('#btnPlay').onclick = () => mapS.playing ? stopPlay() : play();
  $('#btnPrev').onclick = () => stepFrame(-1);
  $('#btnNext').onclick = () => stepFrame(1);
  $('#timeSlider').addEventListener('input', e => { stopPlay(); showFrame(+e.target.value); });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input:not([type=range]), textarea, select') || $('#settings').open) return;
    if (e.key === ' ') { e.preventDefault(); mapS.playing ? stopPlay() : play(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-1); }
  });
}

/* ======================= Laden / Aktualisieren ======================= */
async function mapRefresh(force) {
  $('#frameLoad').textContent = 'lädt …';
  try { await loadModelData(force); } catch (e) { console.warn('Modellraster', e); }
  const jobs = [];
  if (force || !mapS.radar || Date.now() - mapS.radarAt > 4 * MIN) jobs.push(loadRadar().catch(e => console.warn('Radar', e)));
  jobs.push(loadSatTimes().catch(e => console.warn('Satellit', e)));
  await Promise.all(jobs);
  if (mapS.layers.lightning) mapS.lightning.setParams({ _t: Date.now() });
  if (mapS.layers.warn) mapS.warn.setParams({ _t: Date.now() });
  await setRange(mapS.range, false);
}
