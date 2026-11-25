'use strict';
/*
 * Karte in der Handy-App: nutzt das gemeinsame Kartenmodul ../map.js (Radar, Satellit, Modell, Zeitleiste)
 * und ergänzt „Meine Orte“-Chips (Standort, Zuhause, Favoriten) sowie das Ebenen-Blatt.
 */
const mobileMap = {
  ready: false,
  mineLayer: null,

  async show() {
    if (this.ready) { mapS.map.invalidateSize(); return; }
    initMap();                                   // aus map.js
    this.ready = true;
    this.mineLayer = L.layerGroup().addTo(mapS.map);
    enhanceLayerButtons();
    $('#btnLayers').onclick = openLayerSheet;
    $('#layerClose').onclick = closeLayerSheet;
    $('#layerBackdrop').onclick = closeLayerSheet;
    $('#btnLocate').onclick = () => this.center(activeLoc(), true);
    // Regler: Wolken-Deckkraft (20–100 %)
    const op = $('#cloudOp'), opv = $('#cloudOpVal');
    op.value = config.cloudOpacityPct ?? 100; opv.textContent = `${op.value} %`;
    op.addEventListener('input', () => { opv.textContent = `${op.value} %`; setCloudOpacity(+op.value); });
    $('#chkMine').checked = config.showMine !== false;
    $('#chkMine').onchange = e => { config.showMine = e.target.checked; saveCfg(); this.drawMine(); };
    // Quellenangabe: Antippen klappt auf/zu (Links darin bleiben anklickbar)
    const attr = mapS.map.attributionControl.getContainer();
    attr.title = 'Quellen anzeigen';
    attr.addEventListener('click', e => { if (!e.target.closest('a')) attr.classList.toggle('open'); });
    const loc = activeLoc();
    mapS.map.setView(loc ? [loc.lat, loc.lon] : [51.2, 10.4], 6.5);
    loadSummaries().then(() => this.drawMine());
    await mapRefresh(true);                      // aus map.js
  },

  center(loc, closer) {
    if (!loc || !this.ready) return;
    mapS.map.setView([loc.lat, loc.lon], closer ? Math.max(mapS.map.getZoom(), 8) : mapS.map.getZoom());
  },

  refresh() {
    if (!this.ready) return;
    mapRefresh(false);
    loadSummaries(true).then(() => this.drawMine());
  },

  // hervorgehobene Chips für die eigenen Orte – immer sichtbar, unabhängig vom Zoom
  drawMine() {
    if (!this.ready) return;
    this.mineLayer.clearLayers();
    if (config.showMine === false) return;
    const items = [
      [currentLoc(), ICO.pin], [homeLoc(), ICO.home],
      ...config.favs.map(f => [favLoc(f.id), ICO.starFill]),
    ].filter(([l]) => l);
    for (const [loc, kIco] of items) {
      const s = state.summary.get(loc.key);
      // Standort und Zuhause: nur Symbol; Favoriten mit Namen. Punkt + Spitze zeigen den genauen Ort.
      const iconOnly = loc.key === 'current' || loc.key === 'home';
      const label = loc.key === 'home' ? 'Zuhause' : loc.name;
      const html = `<div class="mine-dot"></div><div class="mine-chip${iconOnly ? ' icon-only' : ''}" title="${esc(label)}">` +
        `<span class="k">${kIco}</span>${iconOnly ? '' : `<span class="nm">${esc(label)}</span>`}` +
        `${s ? `${icon(summaryKind(s), 'w')}<span class="tp">${deg(s.t)}</span>` : ''}</div>`;
      L.marker([loc.lat, loc.lon], {
        icon: L.divIcon({ className: 'mine-wrap', html, iconSize: [0, 0] }),
        interactive: true, keyboard: false, zIndexOffset: 2000,
      }).on('click', () => {
        if (loc.key === 'current') config.active = { type: 'current' };
        else if (loc.key === 'home') config.active = { type: 'home' };
        else config.active = { type: 'fav', id: loc.key.slice(4) };
        saveCfg(); showView('wetter'); loadActive();
      }).addTo(this.mineLayer);
    }
  },
};
window.mobileMap = mobileMap;

// Die Ebenen-Knöpfe aus map.js als Liste mit Schaltern darstellen
function enhanceLayerButtons() {
  document.querySelectorAll('#layerButtons button').forEach(b => {
    const emoji = b.textContent.trim(), title = b.title || '';
    const name = title.split(/ \(| – /)[0];
    const sub = title.slice(name.length).replace(/^[\s(–-]+/, '').replace(/[()]/g, '').trim();
    b.innerHTML = `<span class="li">${emoji}</span><span class="lt">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="sw" aria-hidden="true"></span>`;
    b.setAttribute('role', 'switch');
  });
  const sync = () => document.querySelectorAll('#layerButtons button').forEach(b => b.setAttribute('aria-checked', b.classList.contains('on')));
  new MutationObserver(sync).observe($('#layerButtons'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();
}
function openLayerSheet() { $('#layerSheet').hidden = false; $('#layerBackdrop').hidden = false; }
function closeLayerSheet() { $('#layerSheet').hidden = true; $('#layerBackdrop').hidden = true; }

// map.js ruft dies nicht selbst auf; die Handy-App zeichnet stattdessen die Chips
function updateMarkers() { mobileMap.drawMine(); }
