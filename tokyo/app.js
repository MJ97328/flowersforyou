'use strict';
/* =========================================================
   도쿄 여행 지도 🗼
   - 귀여운 파스텔 지도 + 내 위치 + 장소 검색
   - 출발/도착 길찾기 (소요 시간·환승 안내)
   - Day별 일정표 (브라우저에 저장)
   Google Maps 신규 API(Places API (New), Routes API)를 먼저 쓰고,
   실패하면 기존(레거시) Places/Directions 서비스로 자동 전환합니다.
   ========================================================= */

const TOKYO = {lat: 35.681236, lng: 139.767125}; // 도쿄역
const TOKYO_BOUNDS = {south: 35.50, west: 139.40, north: 35.90, east: 139.95};
const STORE_KEY = 'tokyoTrip.v1';
const KEY_STORE = 'tokyoTrip.apiKey';
const MODE_ICON = {TRANSIT: '🚇', WALKING: '🚶', DRIVING: '🚕'};
const VEHICLE_ICON = {SUBWAY: '🚇', METRO_RAIL: '🚇', HEAVY_RAIL: '🚆', COMMUTER_TRAIN: '🚆', HIGH_SPEED_TRAIN: '🚄', RAIL: '🚆', LONG_DISTANCE_TRAIN: '🚆', MONORAIL: '🚝', TRAM: '🚋', LIGHT_RAIL: '🚋', BUS: '🚌', INTERCITY_BUS: '🚌', TROLLEYBUS: '🚎', FERRY: '⛴️', CABLE_CAR: '🚡', GONDOLA_LIFT: '🚡', FUNICULAR: '🚞'};

// 파스텔톤 귀여운 지도 스타일
const CUTE_STYLE = [
  {elementType: 'geometry', stylers: [{color: '#fdf3f6'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#8a6d7a'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#ffffff'}, {weight: 3}]},
  {featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{color: '#f5c6d4'}]},
  {featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{color: '#e0668c'}]},
  {featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{color: '#fbeef2'}]},
  {featureType: 'landscape.natural', elementType: 'geometry', stylers: [{color: '#eaf7ee'}]},
  {featureType: 'poi', elementType: 'geometry', stylers: [{color: '#fde8ef'}]},
  {featureType: 'poi', elementType: 'labels.icon', stylers: [{saturation: -20}, {lightness: 10}]},
  {featureType: 'poi.park', elementType: 'geometry', stylers: [{color: '#c9eedc'}]},
  {featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{color: '#4fa383'}]},
  {featureType: 'road', elementType: 'geometry', stylers: [{color: '#ffffff'}]},
  {featureType: 'road', elementType: 'geometry.stroke', stylers: [{color: '#f7dbe4'}]},
  {featureType: 'road.arterial', elementType: 'geometry', stylers: [{color: '#fff7e0'}]},
  {featureType: 'road.highway', elementType: 'geometry', stylers: [{color: '#ffe3a8'}]},
  {featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{color: '#ffd07a'}]},
  {featureType: 'road', elementType: 'labels.icon', stylers: [{visibility: 'off'}]},
  {featureType: 'transit.line', elementType: 'geometry', stylers: [{color: '#d9c2f0'}]},
  {featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{color: '#9b6fd0'}]},
  {featureType: 'water', elementType: 'geometry', stylers: [{color: '#bfe3ff'}]},
  {featureType: 'water', elementType: 'labels.text.fill', stylers: [{color: '#5d9fd6'}]}
];

/* ---------- 작은 도우미 ---------- */
const $ = id => document.getElementById(id);
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
const uid = () => Math.random().toString(36).slice(2, 10);
const toLL = p => p ? (typeof p.lat === 'function' ? {lat: p.lat(), lng: p.lng()} : {lat: Number(p.lat), lng: Number(p.lng)}) : null;
const pt = o => ({lat: o.lat, lng: o.lng});
const stripHtml = s => s ? (new DOMParser().parseFromString(String(s), 'text/html').body.textContent || '').trim() : '';
const textOf = v => v == null ? '' : typeof v === 'string' ? v : (v.text ?? v.toString?.() ?? '');
function fmtDuration(sec) {
  if (!Number.isFinite(sec)) return '';
  const m = Math.max(1, Math.round(sec / 60));
  return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`;
}
function fmtDistance(m) {
  if (!Number.isFinite(m)) return '';
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
}
function fmtClock(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  return d.toLocaleTimeString('ko-KR', {hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Tokyo'});
}
const toDate = v => v instanceof Date ? v : (v && !isNaN(new Date(v)) ? new Date(v) : null);
function parseDurationSec(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  const m = String(v).match(/^([\d.]+)s$/);
  return m ? Number(m[1]) : NaN;
}

/* ---------- 상태 ---------- */
let map, placesLib = null, routesLib = null, geocoder = null, HtmlMarker;
let myPos = null, meMarker = null, watchId = null, followMe = false;
let sessionToken = null, suggestSeq = 0, suggestItems = [], activeSuggest = -1;
let currentPlace = null, placeMarker = null;
let origin = null;       // null = 내 위치
let dest = null;
let pendingTarget = null; // 'origin' | 'dest' – 다음 검색 결과를 어디에 넣을지
let routeOverlays = [], endpointMarkers = [], lastRoutes = [], planMarkers = [];
const legCache = new Map();

/* ---------- 일정 저장소 ---------- */
function defaultTrip() { return {days: [{id: uid(), title: 'Day 1', items: []}], current: 0}; }
function loadTrip() {
  try {
    const t = JSON.parse(localStorage.getItem(STORE_KEY));
    if (t && Array.isArray(t.days) && t.days.length) {
      t.current = Math.min(Math.max(0, t.current | 0), t.days.length - 1);
      return t;
    }
  } catch {}
  return defaultTrip();
}
let trip = loadTrip();
function saveTrip() { try { localStorage.setItem(STORE_KEY, JSON.stringify(trip)); } catch {} }
const curDay = () => trip.days[trip.current];

/* =========================================================
   Google Maps 불러오기
   ========================================================= */
function getApiKey() {
  const cfg = (window.TOKYO_MAP_CONFIG && window.TOKYO_MAP_CONFIG.apiKey) || '';
  let saved = '';
  try { saved = localStorage.getItem(KEY_STORE) || ''; } catch {}
  return cfg.trim() || saved.trim();
}
function askKey() {
  const dlg = $('key-dialog');
  $('key-input').value = (() => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } })();
  if (!dlg.open) dlg.showModal();
}
$('key-form').addEventListener('submit', e => {
  const v = $('key-input').value.trim();
  if (!v) { e.preventDefault(); return; }
  try { localStorage.setItem(KEY_STORE, v); } catch {}
  location.reload();
});
$('key-btn').addEventListener('click', askKey);

window.gm_authFailure = () => {
  toast('API 키가 거부됐어요 😢 키와 사용 설정된 API를 확인해주세요', 6000);
  askKey();
};

function loadGoogleMaps(key) {
  return new Promise((resolve, reject) => {
    window.__tokyoMapReady = resolve;
    const params = new URLSearchParams({key, v: 'weekly', language: 'ko', region: 'JP', loading: 'async', callback: '__tokyoMapReady'});
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?' + params;
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps 스크립트를 불러오지 못했어요'));
    document.head.append(s);
  });
}

async function boot() {
  renderPlan();
  const key = getApiKey();
  if (!key) { askKey(); return; }
  try {
    await loadGoogleMaps(key);
    const {Map} = await google.maps.importLibrary('maps');
    try { placesLib = await google.maps.importLibrary('places'); } catch (e) { console.warn('places', e); }
    try { routesLib = await google.maps.importLibrary('routes'); } catch (e) { console.warn('routes', e); }
    try { const g = await google.maps.importLibrary('geocoding'); geocoder = new g.Geocoder(); } catch {}
    defineHtmlMarker();
    map = new Map($('map'), {
      center: TOKYO, zoom: 13, styles: CUTE_STYLE,
      disableDefaultUI: true, zoomControl: true, clickableIcons: true, gestureHandling: 'greedy',
      zoomControlOptions: {position: google.maps.ControlPosition.RIGHT_TOP}
    });
    map.addListener('click', onMapClick);
    startLocation();
    renderPlanMarkers();
  } catch (e) {
    console.error(e);
    toast('지도를 불러오지 못했어요 😢 ' + (e.message || ''), 6000);
  }
}

/* ---------- HTML 마커 (OverlayView) ---------- */
function defineHtmlMarker() {
  HtmlMarker = class extends google.maps.OverlayView {
    constructor({position, html, className = '', title = '', onClick, zIndex = 1}) {
      super();
      this.pos = new google.maps.LatLng(pt(position));
      this.el = h('div', {class: className, title, role: onClick ? 'button' : null, tabindex: onClick ? '0' : null});
      this.el.style.zIndex = zIndex;
      if (html instanceof Node) this.el.append(html); else this.el.innerHTML = html;
      if (onClick) {
        this.el.addEventListener('click', e => { e.stopPropagation(); onClick(); });
        this.el.addEventListener('keydown', e => { if (e.key === 'Enter') onClick(); });
      }
      google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.el);
      this.setMap(map);
    }
    onAdd() { this.getPanes().overlayMouseTarget.append(this.el); }
    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(this.pos);
      if (!p) return;
      this.el.style.left = p.x + 'px'; this.el.style.top = p.y + 'px';
    }
    onRemove() { this.el.remove(); }
    setPosition(ll) { this.pos = new google.maps.LatLng(pt(ll)); this.draw(); }
    remove() { this.setMap(null); }
  };
}
function pinMarker(ll, {emoji = '🌸', label = '', cls = '', onClick, zIndex = 5} = {}) {
  const frag = h('div', {}, h('div', {class: 'pin'}, h('span', {}, emoji)), label ? h('div', {class: 'label'}, label) : null);
  return new HtmlMarker({position: ll, html: frag, className: `hm drop ${cls}`, title: label, onClick, zIndex});
}

/* =========================================================
   내 위치
   ========================================================= */
function startLocation() {
  if (!('geolocation' in navigator)) { toast('이 브라우저는 위치를 지원하지 않아요'); return; }
  watchId = navigator.geolocation.watchPosition(pos => {
    const first = !myPos;
    myPos = {lat: pos.coords.latitude, lng: pos.coords.longitude};
    if (!meMarker) {
      meMarker = new HtmlMarker({position: myPos, className: 'me', zIndex: 50,
        html: '<div class="ring"></div><div class="core">🐰</div>'});
    } else meMarker.setPosition(myPos);
    if (followMe) map.panTo(myPos);
    if (first) {
      updateRouteFields();
      if (inTokyoArea(myPos)) map.panTo(myPos);
    }
  }, err => {
    if (err.code === err.PERMISSION_DENIED) toast('위치 권한이 꺼져 있어요. 출발지를 직접 골라주세요 🙏', 4000);
  }, {enableHighAccuracy: true, maximumAge: 10000, timeout: 20000});
}
function inTokyoArea(p) { return p.lat > 35.2 && p.lat < 36.2 && p.lng > 139.0 && p.lng < 140.3; }
$('locate-btn').addEventListener('click', () => {
  if (!map) return;
  if (!myPos) { toast('위치를 찾는 중이에요… 🐰'); if (watchId == null) startLocation(); return; }
  followMe = !followMe;
  $('locate-btn').classList.toggle('tracking', followMe);
  map.panTo(myPos); if (map.getZoom() < 15) map.setZoom(16);
  toast(followMe ? '내 위치를 따라가요 🐰' : '따라가기 끝!');
});
$('tokyo-btn').addEventListener('click', () => { if (map) { followMe = false; $('locate-btn').classList.remove('tracking'); map.panTo(TOKYO); map.setZoom(13); } });

/* =========================================================
   검색 (Places API (New) → 레거시 대체)
   ========================================================= */
const input = $('search-input'), list = $('suggestions');
let debounce;
input.addEventListener('input', () => {
  clearTimeout(debounce);
  const q = input.value.trim();
  if (!q) { hideSuggest(); return; }
  debounce = setTimeout(() => suggest(q), 220);
});
input.addEventListener('keydown', e => {
  if (list.hidden || !suggestItems.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    activeSuggest = (activeSuggest + (e.key === 'ArrowDown' ? 1 : -1) + suggestItems.length) % suggestItems.length;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', i === activeSuggest));
  } else if (e.key === 'Escape') hideSuggest();
});
$('search-form').addEventListener('submit', e => {
  e.preventDefault();
  if (suggestItems.length) pickSuggestion(suggestItems[Math.max(0, activeSuggest)]);
  else if (input.value.trim()) suggest(input.value.trim()).then(() => suggestItems[0] && pickSuggestion(suggestItems[0]));
});
document.addEventListener('click', e => { if (!$('search-form').contains(e.target)) hideSuggest(); });
function hideSuggest() { list.hidden = true; activeSuggest = -1; }

async function suggest(q) {
  if (!map) return;
  const seq = ++suggestSeq;
  let items = [];
  try { items = await suggestNew(q); }
  catch (e) {
    console.warn('Places (New) 실패, 레거시로 시도', e);
    try { items = await suggestLegacy(q); } catch (e2) { console.warn(e2); toast('검색이 안 돼요 😢 Places API가 켜져 있는지 확인해주세요', 4000); }
  }
  if (seq !== suggestSeq) return;
  suggestItems = items; activeSuggest = -1;
  list.replaceChildren(...items.map((it, i) => h('li', {role: 'option', 'aria-selected': 'false', onclick: () => pickSuggestion(it)},
    h('span', {}, i === 0 ? '🌸' : '📍'),
    h('span', {}, h('span', {class: 's-main'}, it.main), h('span', {class: 's-sub'}, it.sub)))));
  if (!items.length) list.replaceChildren(h('li', {}, '검색 결과가 없어요 🥲'));
  list.hidden = false;
}
async function suggestNew(q) {
  const {AutocompleteSuggestion, AutocompleteSessionToken} = placesLib || {};
  if (!AutocompleteSuggestion) throw new Error('no AutocompleteSuggestion');
  if (!sessionToken) sessionToken = new AutocompleteSessionToken();
  const req = {input: q, sessionToken, language: 'ko', region: 'jp', locationBias: TOKYO_BOUNDS};
  if (myPos) req.origin = myPos;
  const {suggestions} = await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
  return (suggestions || []).filter(s => s.placePrediction).map(s => {
    const p = s.placePrediction;
    return {
      main: textOf(p.mainText) || textOf(p.text),
      sub: textOf(p.secondaryText),
      resolve: async () => {
        const place = p.toPlace();
        await place.fetchFields({fields: ['displayName', 'formattedAddress', 'location']});
        sessionToken = null;
        return {placeId: place.id, name: textOf(place.displayName) || textOf(p.mainText), address: place.formattedAddress || '', ...toLL(place.location)};
      }
    };
  });
}
function suggestLegacy(q) {
  return new Promise((resolve, reject) => {
    const svc = new google.maps.places.AutocompleteService();
    svc.getPlacePredictions({input: q, language: 'ko', region: 'jp', bounds: TOKYO_BOUNDS}, (preds, status) => {
      if (status === 'ZERO_RESULTS') return resolve([]);
      if (status !== 'OK') return reject(new Error(status));
      resolve(preds.map(p => ({
        main: p.structured_formatting?.main_text || p.description,
        sub: p.structured_formatting?.secondary_text || '',
        resolve: () => legacyDetails(p.place_id)
      })));
    });
  });
}
function legacyDetails(placeId) {
  return new Promise((resolve, reject) => {
    new google.maps.places.PlacesService(map).getDetails({placeId, fields: ['name', 'formatted_address', 'geometry'], language: 'ko'}, (r, status) => {
      if (status !== 'OK') return reject(new Error(status));
      resolve({placeId, name: r.name, address: r.formatted_address || '', ...toLL(r.geometry.location)});
    });
  });
}
async function pickSuggestion(it) {
  hideSuggest();
  try {
    const place = await it.resolve();
    input.value = place.name;
    input.blur();
    selectPlace(place, true);
  } catch (e) { console.warn(e); toast('장소 정보를 가져오지 못했어요 😢'); }
}

/* ---------- 지도 클릭 ---------- */
async function onMapClick(e) {
  hideSuggest();
  const ll = toLL(e.latLng);
  if (e.placeId) {
    e.stop(); // 기본 정보창 대신 귀여운 카드
    try { selectPlace(await placeById(e.placeId, ll)); return; } catch (err) { console.warn(err); }
  }
  const place = {name: '지도에서 고른 곳 📌', address: `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`, ...ll};
  selectPlace(place);
  if (geocoder) {
    geocoder.geocode({location: ll, language: 'ko'}).then(({results}) => {
      if (results?.[0] && currentPlace === place) {
        place.address = results[0].formatted_address;
        $('place-address').textContent = place.address;
      }
    }).catch(() => {});
  }
}
async function placeById(id, ll) {
  if (placesLib?.Place) {
    try {
      const place = new placesLib.Place({id});
      await place.fetchFields({fields: ['displayName', 'formattedAddress', 'location']});
      return {placeId: id, name: textOf(place.displayName), address: place.formattedAddress || '', ...(toLL(place.location) || ll)};
    } catch (e) { console.warn('Place(New) 실패', e); }
  }
  return legacyDetails(id);
}

/* ---------- 장소 카드 ---------- */
function selectPlace(place, pan = false) {
  currentPlace = place;
  placeMarker?.remove();
  placeMarker = pinMarker(place, {emoji: '🌸', label: place.name.replace(/ 📌$/, ''), zIndex: 30});
  if (pan) { map.panTo(pt(place)); if (map.getZoom() < 15) map.setZoom(16); }

  if (pendingTarget) { setEndpoint(pendingTarget, place); pendingTarget = null; markActiveField(); return; }
  $('place-name').textContent = place.name;
  $('place-address').textContent = place.address;
  $('place-card').hidden = false;
}
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
  $(b.dataset.close).hidden = true; placeMarker?.remove(); placeMarker = null;
}));
$('set-origin').addEventListener('click', () => currentPlace && setEndpoint('origin', currentPlace));
$('set-dest').addEventListener('click', () => currentPlace && setEndpoint('dest', currentPlace));
$('add-to-day').addEventListener('click', () => currentPlace && openDayPicker(currentPlace));

/* =========================================================
   길찾기
   ========================================================= */
function setEndpoint(which, place) {
  if (which === 'origin') origin = place; else dest = place;
  $('place-card').hidden = true;
  switchTab('route'); openSheet('half');
  updateRouteFields();
  toast(which === 'origin' ? '🐣 출발지 설정!' : '🏁 도착지 설정!');
  if (dest && (origin || myPos)) runRoute();
}
function updateRouteFields() {
  const o = $('origin-field'), d = $('dest-field');
  o.textContent = origin ? '📍 ' + origin.name : (myPos ? '🐰 내 위치' : '🐰 내 위치 (찾는 중…)');
  o.classList.remove('empty');
  d.textContent = dest ? '📍 ' + dest.name : '검색하거나 지도를 눌러주세요';
  d.classList.toggle('empty', !dest);
}
function markActiveField() {
  $('origin-field').classList.toggle('active', pendingTarget === 'origin');
  $('dest-field').classList.toggle('active', pendingTarget === 'dest');
}
for (const which of ['origin', 'dest']) {
  $(which + '-field').addEventListener('click', () => {
    pendingTarget = which; markActiveField();
    input.value = ''; input.focus();
    toast(`검색하거나 지도를 눌러서 ${which === 'origin' ? '출발지' : '도착지'}를 골라주세요`);
  });
  $(which + '-me').addEventListener('click', () => {
    if (which === 'origin') origin = null; else if (myPos) dest = {name: '내 위치', address: '', ...myPos}; else { toast('아직 위치를 못 찾았어요 🐰'); return; }
    updateRouteFields();
  });
}
$('swap-btn').addEventListener('click', () => {
  const o = origin || (myPos ? {name: '내 위치', address: '', ...myPos} : null);
  origin = dest; dest = o;
  updateRouteFields();
});
$('depart-now').addEventListener('click', () => { $('depart-at').value = ''; toast('지금 출발 기준이에요 ⏰'); });
$('route-btn').addEventListener('click', runRoute);
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => dest && runRoute()));

function getMode(name = 'mode') { return document.querySelector(`input[name=${name}]:checked`).value; }
function getDepartTime() {
  const v = $('depart-at').value;
  if (!v) return new Date();
  // 입력값은 도쿄 시간으로 간주
  const d = new Date(v + ':00+09:00');
  return isNaN(d) ? new Date() : d;
}

async function runRoute() {
  if (!map) return;
  const from = origin || (myPos ? {name: '내 위치', ...myPos} : null);
  if (!from) { toast('출발지를 골라주세요 (위치 권한이 없어요) 🐣'); return; }
  if (!dest) { toast('도착지를 골라주세요 🏁'); return; }
  const out = $('route-result'), btn = $('route-btn');
  btn.disabled = true;
  out.replaceChildren(h('div', {class: 'loading'}, '🐰💨'));
  try {
    const routes = await computeRoutes(from, dest, getMode(), getDepartTime(), true);
    lastRoutes = routes;
    showRoute(0, from, dest);
    out.scrollIntoView({block: 'start', behavior: 'smooth'});
  } catch (e) {
    console.warn(e);
    clearRouteOverlays();
    out.replaceChildren(h('p', {class: 'error-note'}, '길을 찾지 못했어요 🥲', h('br'), routeErrorText(e)));
  } finally { btn.disabled = false; }
}
function routeErrorText(e) {
  const s = String(e?.message || e);
  if (/ZERO_RESULTS|no route/i.test(s)) return '이 수단으로는 갈 수 없는 경로예요. 다른 수단을 골라보세요!';
  if (/denied|not activated|REQUEST_DENIED|403|PERMISSION/i.test(s)) return 'Routes API(또는 Directions API)가 켜져 있는지 확인해주세요.';
  return s;
}

/* 경로 계산: Routes API → Directions(레거시) 순서로 시도 */
async function computeRoutes(from, to, mode, when, alternatives = false) {
  const errors = [];
  if (routesLib?.Route?.computeRoutes) {
    try {
      const r = await computeRoutesNew(from, to, mode, when, alternatives);
      if (r.length) return r;
      errors.push(new Error('ZERO_RESULTS'));
    } catch (e) { console.warn('Routes API 실패, Directions로 시도', e); errors.push(e); }
  }
  try { return await computeRoutesLegacy(from, to, mode, when, alternatives); }
  catch (e) { errors.push(e); throw errors.find(x => /ZERO_RESULTS/.test(x.message)) || e; }
}

async function computeRoutesNew(from, to, mode, when, alternatives) {
  const req = {
    origin: {lat: from.lat, lng: from.lng},
    destination: {lat: to.lat, lng: to.lng},
    travelMode: mode,
    language: 'ko', region: 'jp',
    computeAlternativeRoutes: alternatives,
    fields: ['path', 'legs', 'durationMillis', 'distanceMeters', 'localizedValues', 'travelAdvisory']
  };
  if (mode === 'TRANSIT') req.departureTime = when;
  const {routes} = await routesLib.Route.computeRoutes(req);
  return (routes || []).map(normalizeNewRoute).filter(r => r.path.length);
}
function normalizeNewRoute(route) {
  const steps = [];
  let dur = Number(route.durationMillis) / 1000;
  let dist = Number(route.distanceMeters);
  let sumDur = 0, sumDist = 0, depart = null, arrive = null;
  for (const leg of route.legs || []) {
    sumDur += Number(leg.durationMillis ?? leg.staticDurationMillis) / 1000 || 0;
    sumDist += Number(leg.distanceMeters) || 0;
    for (const st of leg.steps || []) {
      const td = st.transitDetails;
      const s = {
        mode: st.travelMode || (td ? 'TRANSIT' : 'WALKING'),
        text: st.instructions || st.navigationInstruction?.instructions || '',
        distance: fmtDistance(Number(st.distanceMeters)) || textOf(st.localizedValues?.distance),
        duration: fmtDuration(Number(st.staticDurationMillis) / 1000) || textOf(st.localizedValues?.staticDuration),
        path: (st.path || []).map(toLL)
      };
      if (td) {
        const line = td.transitLine || {};
        const dep = toDate(td.departureTime), arr = toDate(td.arrivalTime);
        depart ??= dep; if (arr) arrive = arr;
        s.transit = {
          line: line.nameShort || line.shortName || line.name || '',
          lineFull: line.name || '',
          color: line.color || '#ff8fab', textColor: line.textColor || '#fff',
          vehicle: line.vehicle?.type || line.vehicle?.name?.type || '',
          vehicleName: textOf(line.vehicle?.name) || '',
          from: td.departureStop?.name || '', to: td.arrivalStop?.name || '',
          headsign: td.headsign || '', stops: td.stopCount,
          depTime: fmtClock(dep) || textOf(td.localizedValues?.departureTime?.time),
          arrTime: fmtClock(arr) || textOf(td.localizedValues?.arrivalTime?.time)
        };
      }
      steps.push(s);
    }
  }
  if (!Number.isFinite(dur) || !dur) dur = sumDur;
  if (!Number.isFinite(dist) || !dist) dist = sumDist;
  return {
    durationSec: dur, distanceM: dist,
    durationText: fmtDuration(dur) || textOf(route.localizedValues?.duration),
    distanceText: fmtDistance(dist) || textOf(route.localizedValues?.distance),
    fare: textOf(route.localizedValues?.transitFare),
    departText: fmtClock(depart), arriveText: fmtClock(arrive),
    path: (route.path || []).map(toLL), steps
  };
}

function computeRoutesLegacy(from, to, mode, when, alternatives) {
  return new Promise((resolve, reject) => {
    const req = {
      origin: {lat: from.lat, lng: from.lng}, destination: {lat: to.lat, lng: to.lng},
      travelMode: google.maps.TravelMode[mode], provideRouteAlternatives: alternatives, region: 'jp'
    };
    if (mode === 'TRANSIT') req.transitOptions = {departureTime: when};
    new google.maps.DirectionsService().route(req, (res, status) => {
      if (status !== 'OK') return reject(new Error(status));
      resolve(res.routes.map(r => {
        const leg = r.legs[0];
        return {
          durationSec: leg.duration?.value, distanceM: leg.distance?.value,
          durationText: fmtDuration(leg.duration?.value) || leg.duration?.text,
          distanceText: leg.distance?.text || '',
          fare: r.fare?.text || '',
          departText: leg.departure_time?.text || '', arriveText: leg.arrival_time?.text || '',
          path: r.overview_path.map(toLL),
          steps: leg.steps.map(st => {
            const s = {mode: st.travel_mode, text: stripHtml(st.instructions), distance: st.distance?.text || '', duration: st.duration?.text || '', path: (st.path || []).map(toLL)};
            if (st.transit) {
              const t = st.transit, line = t.line || {};
              s.transit = {
                line: line.short_name || line.name || '', lineFull: line.name || '',
                color: line.color || '#ff8fab', textColor: line.text_color || '#fff',
                vehicle: line.vehicle?.type || '', vehicleName: line.vehicle?.name || '',
                from: t.departure_stop?.name || '', to: t.arrival_stop?.name || '',
                headsign: t.headsign || '', stops: t.num_stops,
                depTime: t.departure_time?.text || '', arrTime: t.arrival_time?.text || ''
              };
            }
            return s;
          })
        };
      }));
    });
  });
}

/* ---------- 경로 표시 ---------- */
function clearRouteOverlays() {
  routeOverlays.forEach(o => o.setMap ? o.setMap(null) : o.remove());
  endpointMarkers.forEach(m => m.remove());
  routeOverlays = []; endpointMarkers = [];
}
function drawRoute(route, {color = '#f45b87', fit = true} = {}) {
  const bounds = new google.maps.LatLngBounds();
  const segs = route.steps.some(s => s.path.length > 1) ? route.steps.filter(s => s.path.length > 1) : [{mode: 'DRIVING', path: route.path}];
  for (const s of segs) {
    s.path.forEach(p => bounds.extend(p));
    const walking = s.mode === 'WALKING' || s.mode === 'WALK';
    const c = s.transit ? s.transit.color : color;
    // 흰 테두리 + 색 선 (귀여운 두꺼운 선)
    if (!walking) routeOverlays.push(new google.maps.Polyline({map, path: s.path, strokeColor: '#ffffff', strokeWeight: 11, strokeOpacity: 1, zIndex: 1}));
    routeOverlays.push(new google.maps.Polyline(walking ? {
      map, path: s.path, strokeOpacity: 0, zIndex: 2,
      icons: [{icon: {path: google.maps.SymbolPath.CIRCLE, scale: 3.2, fillColor: '#9cc9ff', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.5}, offset: '0', repeat: '12px'}]
    } : {map, path: s.path, strokeColor: c, strokeWeight: 6, strokeOpacity: 1, zIndex: 2}));
  }
  if (fit && !bounds.isEmpty()) fitBounds(bounds);
  return bounds;
}
function fitBounds(bounds) {
  const wide = matchMedia('(min-width:900px)').matches;
  map.fitBounds(bounds, wide ? {top: 90, bottom: 40, left: 440, right: 80} : {top: 90, bottom: Math.round(innerHeight * 0.48), left: 30, right: 70});
}

function showRoute(idx, from, to) {
  const route = lastRoutes[idx];
  clearRouteOverlays();
  clearPlanOverlays();
  drawRoute(route);
  endpointMarkers.push(pinMarker(from, {emoji: '🐣', label: from.name, cls: 'origin', zIndex: 20}));
  endpointMarkers.push(pinMarker(to, {emoji: '🏁', label: to.name, zIndex: 20}));

  const mode = getMode();
  const summary = h('div', {class: 'summary'},
    h('span', {class: 'big'}, `${MODE_ICON[mode]} ${route.durationText}`),
    h('span', {class: 'sub'}, route.distanceText),
    route.fare ? h('span', {class: 'sub'}, '💴 ' + route.fare) : null,
    route.departText || route.arriveText ? h('span', {class: 'times'}, `${route.departText || '지금'} 출발 → ${route.arriveText} 도착`) : null);

  const alts = lastRoutes.length > 1 ? h('div', {class: 'alt-routes'}, lastRoutes.map((r, i) =>
    h('button', {type: 'button', class: i === idx ? 'on' : '', onclick: () => showRoute(i, from, to)},
      `경로 ${i + 1} · ${r.durationText}`))) : null;

  const steps = h('ol', {class: 'steps'}, route.steps.map(stepItem));
  $('route-result').replaceChildren(summary, alts || '', steps);
}
function stepItem(s) {
  if (s.transit) {
    const t = s.transit;
    return h('li', {},
      h('span', {class: 'ico'}, VEHICLE_ICON[t.vehicle] || '🚃'),
      h('div', {class: 'body'},
        h('div', {}, h('span', {class: 'line-badge', style: `background:${safeColor(t.color)};color:${safeColor(t.textColor, '#fff')}`}, t.line || t.vehicleName || '노선'),
          t.headsign ? `${t.headsign} 방면` : ''),
        h('div', {}, `🟢 ${t.from} ${t.depTime ? `(${t.depTime})` : ''}`),
        h('div', {}, `🔴 ${t.to} ${t.arrTime ? `(${t.arrTime})` : ''}`),
        h('div', {class: 'meta'}, [t.stops ? `${t.stops}개 역` : '', s.duration].filter(Boolean).join(' · '))));
  }
  const walking = s.mode === 'WALKING' || s.mode === 'WALK';
  return h('li', {},
    h('span', {class: 'ico'}, walking ? '🚶' : '🚕'),
    h('div', {class: 'body'}, h('div', {}, s.text || (walking ? '걷기' : '이동')),
      h('div', {class: 'meta'}, [s.distance, s.duration].filter(Boolean).join(' · '))));
}
function safeColor(c, fallback = '#ff8fab') { return /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : fallback; }

/* =========================================================
   일정표 (Day 1, Day 2 …)
   ========================================================= */
function renderPlan() {
  const day = curDay();
  $('day-tabs').replaceChildren(
    ...trip.days.map((d, i) => h('button', {type: 'button', class: i === trip.current ? 'on' : '', onclick: () => { trip.current = i; saveTrip(); renderPlan(); renderPlanMarkers(); }}, d.title || `Day ${i + 1}`)),
    h('button', {type: 'button', class: 'add-day', onclick: addDay}, '＋ Day'));
  $('day-title').value = day.title;
  $('day-empty').hidden = day.items.length > 0;
  $('day-delete').hidden = trip.days.length < 2;

  const listEl = $('day-list');
  listEl.replaceChildren();
  const mode = getMode('plan-mode');
  day.items.forEach((it, i) => {
    listEl.append(h('li', {class: 'day-item'},
      h('span', {class: 'num'}, i + 1),
      h('div', {class: 'info', onclick: () => focusItem(it)},
        h('div', {class: 'nm'}, it.name),
        it.address ? h('div', {class: 'ad'}, it.address) : null,
        it.time || it.memo ? h('div', {class: 'memo'}, it.time ? h('span', {class: 'tm'}, it.time) : null, it.memo || '') : null),
      h('div', {class: 'ops'},
        h('button', {type: 'button', 'aria-label': '위로', title: '위로', disabled: i === 0, onclick: () => moveItem(i, -1)}, '▲'),
        h('button', {type: 'button', 'aria-label': '아래로', title: '아래로', disabled: i === day.items.length - 1, onclick: () => moveItem(i, 1)}, '▼'),
        h('button', {type: 'button', 'aria-label': '메모 수정', title: '메모', onclick: () => editItem(it)}, '✎'),
        h('button', {type: 'button', 'aria-label': '삭제', title: '삭제', onclick: () => removeItem(i)}, '✕'))));
    const next = day.items[i + 1];
    if (next) {
      const leg = legCache.get(legKey(it, next, mode));
      listEl.append(h('li', {class: 'leg', 'aria-label': '이동'},
        leg ? (leg.error ? '길을 못 찾았어요 🥲' : [MODE_ICON[mode] + ' ', h('b', {}, leg.durationText), ` · ${leg.distanceText} `]) : `${MODE_ICON[mode]} ··· `,
        h('button', {type: 'button', onclick: () => { origin = it; dest = next; setModeRadio(mode); updateRouteFields(); switchTab('route'); runRoute(); }}, '자세히')));
    }
  });
  const legs = day.items.slice(1).map((it, i) => legCache.get(legKey(day.items[i], it, mode)));
  if (legs.length && legs.every(l => l && !l.error)) {
    const total = legs.reduce((a, l) => a + (l.durationSec || 0), 0);
    $('day-summary').textContent = `총 이동 시간 ${fmtDuration(total)} ${MODE_ICON[mode]}`;
  } else $('day-summary').textContent = '';
}
function setModeRadio(mode) { const r = document.querySelector(`input[name=mode][value=${mode}]`); if (r) r.checked = true; }
const legKey = (a, b, mode) => `${a.lat},${a.lng}>${b.lat},${b.lng}:${mode}`;

function addDay() {
  trip.days.push({id: uid(), title: `Day ${trip.days.length + 1}`, items: []});
  trip.current = trip.days.length - 1;
  saveTrip(); renderPlan(); renderPlanMarkers();
  return trip.current;
}
$('day-title').addEventListener('input', e => { curDay().title = e.target.value.trim() || `Day ${trip.current + 1}`; saveTrip(); });
$('day-title').addEventListener('change', () => renderPlan());
$('day-delete').addEventListener('click', () => {
  if (trip.days.length < 2) return;
  if (!confirm(`'${curDay().title}' 일정을 지울까요?`)) return;
  trip.days.splice(trip.current, 1);
  trip.current = Math.max(0, trip.current - 1);
  saveTrip(); renderPlan(); renderPlanMarkers();
});
function moveItem(i, d) {
  const items = curDay().items;
  [items[i], items[i + d]] = [items[i + d], items[i]];
  saveTrip(); renderPlan(); renderPlanMarkers();
}
function removeItem(i) {
  curDay().items.splice(i, 1);
  saveTrip(); renderPlan(); renderPlanMarkers();
}
function editItem(it) {
  const memo = prompt('📝 메모', it.memo || '');
  if (memo === null) return;
  const time = prompt('🕒 시간 (예: 10:30)', it.time || '');
  it.memo = memo.trim().slice(0, 80);
  if (time !== null) it.time = time.trim().slice(0, 10);
  saveTrip(); renderPlan();
}
function focusItem(it) {
  if (!map) return;
  map.panTo(pt(it)); if (map.getZoom() < 15) map.setZoom(16);
  if (matchMedia('(max-width:899px)').matches) openSheet('min');
}

/* 일정 추가 다이얼로그 */
let pickingPlace = null;
function openDayPicker(place) {
  pickingPlace = place;
  $('add-time').value = ''; $('add-memo').value = '';
  $('day-picker-list').replaceChildren(
    ...trip.days.map((d, i) => h('button', {type: 'button', onclick: () => addToDay(i)}, `📅 ${d.title}  (${d.items.length})`)),
    h('button', {type: 'button', class: 'new', onclick: () => addToDay(addDay())}, '＋ 새 Day 만들기'));
  $('day-picker').showModal();
}
function addToDay(i) {
  const p = pickingPlace; if (!p) return;
  trip.days[i].items.push({
    id: uid(), name: p.name.replace(/ 📌$/, ''), address: p.address || '', lat: p.lat, lng: p.lng, placeId: p.placeId || null,
    time: $('add-time').value, memo: $('add-memo').value.trim()
  });
  trip.current = i;
  saveTrip();
  $('day-picker').close();
  $('place-card').hidden = true;
  switchTab('plan'); openSheet('half');
  renderPlan(); renderPlanMarkers();
  toast(`📒 ${trip.days[i].title}에 추가했어요!`);
}

/* 일정 마커 & 하루 동선 */
function clearPlanOverlays() { planMarkers.forEach(m => m.setMap ? m.setMap(null) : m.remove()); planMarkers = []; }
function renderPlanMarkers() {
  if (!map || !HtmlMarker) return;
  clearPlanOverlays();
  if ($('tab-plan').hidden) return;
  curDay().items.forEach((it, i) => planMarkers.push(pinMarker(it, {emoji: String(i + 1), label: it.name, cls: 'num', zIndex: 10 + i, onClick: () => focusItem(it)})));
}
$('plan-route-btn').addEventListener('click', async () => {
  const items = curDay().items;
  if (!map) return;
  if (items.length < 2) { toast('장소가 2개 이상 있어야 동선을 보여줄 수 있어요 🐾'); return; }
  const mode = getMode('plan-mode'), btn = $('plan-route-btn');
  btn.disabled = true; btn.textContent = '🐰💨 계산 중…';
  clearRouteOverlays(); renderPlanMarkers();
  const bounds = new google.maps.LatLngBounds();
  items.forEach(it => bounds.extend(pt(it)));
  try {
    for (let i = 0; i < items.length - 1; i++) {
      const key = legKey(items[i], items[i + 1], mode);
      let leg = legCache.get(key);
      if (!leg || leg.error) {
        try { leg = (await computeRoutes(items[i], items[i + 1], mode, new Date(), false))[0]; }
        catch (e) { console.warn(e); leg = {error: true}; }
        legCache.set(key, leg);
      }
      if (!leg.error) {
        const layer = drawRoute(leg, {fit: false});
        bounds.union(layer);
        // drawRoute가 routeOverlays에 넣은 것을 일정 레이어로 옮김
        planMarkers.push(...routeOverlays); routeOverlays = [];
      }
      renderPlan();
    }
    fitBounds(bounds);
  } finally { btn.disabled = false; btn.textContent = '🗺️ 하루 동선 보기'; }
});
document.querySelectorAll('input[name=plan-mode]').forEach(r => r.addEventListener('change', renderPlan));

/* 내보내기 / 불러오기 */
$('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(trip, null, 2)], {type: 'application/json'});
  const a = h('a', {href: URL.createObjectURL(blob), download: 'tokyo-trip.json'});
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('import-input').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const t = JSON.parse(await f.text());
    if (!Array.isArray(t.days) || !t.days.length) throw new Error();
    t.days = t.days.map((d, i) => ({
      id: String(d.id || uid()), title: String(d.title || `Day ${i + 1}`).slice(0, 30),
      items: (Array.isArray(d.items) ? d.items : []).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng)).map(x => ({
        id: String(x.id || uid()), name: String(x.name || '장소').slice(0, 80), address: String(x.address || '').slice(0, 160),
        lat: x.lat, lng: x.lng, placeId: x.placeId ? String(x.placeId) : null, time: String(x.time || '').slice(0, 10), memo: String(x.memo || '').slice(0, 80)
      }))
    }));
    t.current = 0;
    trip = t; saveTrip(); renderPlan(); renderPlanMarkers();
    toast('일정을 불러왔어요 📂');
  } catch { toast('올바른 일정 파일이 아니에요 🥲'); }
});

/* =========================================================
   시트 & 탭
   ========================================================= */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on); t.setAttribute('aria-selected', on);
  });
  $('tab-route').hidden = name !== 'route';
  $('tab-plan').hidden = name !== 'plan';
  if (name === 'plan') renderPlan();
  renderPlanMarkers();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { switchTab(t.dataset.tab); if ($('sheet').dataset.state === 'min') openSheet('half'); }));
function openSheet(state) { $('sheet').dataset.state = state; }
$('sheet-handle').addEventListener('click', () => {
  const s = $('sheet').dataset.state;
  openSheet(s === 'min' ? 'half' : s === 'half' ? 'full' : 'min');
});
// 핸들을 위/아래로 쓸어서 크기 조절
(() => {
  let y0 = null;
  const handle = $('sheet-handle');
  handle.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, {passive: true});
  handle.addEventListener('touchend', e => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    if (Math.abs(dy) < 25) return;
    const order = ['min', 'half', 'full'], i = order.indexOf($('sheet').dataset.state);
    openSheet(order[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)))]);
    e.preventDefault();
  });
})();

updateRouteFields();
boot();
