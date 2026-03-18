<template>
<div class='find-place' :class='{centered: boxInTheMiddle}'>
  <div v-if='boxInTheMiddle' class='hero-content'>
    <div class='hero-chip'>Generador de mapas artísticos</div>
    <h1 class='hero-title'>city<br><em>roads</em></h1>
    <p class='hero-sub'>Cada calle. Cualquier ciudad. Un mapa impresionante.</p>
  </div>
  <div class='search-wrap'>
    <div class='search-box' :class='{focused: isFocused}'>
      <span class='srch-icon'>⌕</span>
      <input class='query-input' v-model='enteredInput' type='text'
        placeholder='Escribe el nombre de una ciudad…'
        autocomplete='off' spellcheck='false'
        inputmode='search' enterkeyhint='search'
        ref='input'
        @focus='isFocused=true' @blur='isFocused=false'
        @keydown.enter.prevent='onSubmit'>
      <a type='submit' class='search-submit' href='#' @click.prevent='onSubmit'>Buscar</a>
    </div>

    <div v-if='showWarning' class='prompt-note'>
      ⚠ Ciudades grandes pueden requerir 200MB+ de datos.
    </div>

    <div class='results' v-if='!loading'>
      <div v-if='suggestionsLoaded && suggestions.length' class='suggestions'>
        <div class='sug-head'>Selecciona los límites de la ciudad</div>
        <ul class='sug-list'>
          <li v-for='(suggestion, index) in suggestions' :key='index'>
            <a @click.prevent='pickSuggestion(suggestion)' class='suggestion' href='#'>
              <span class='sug-name'>{{suggestion.name}}</span>
              <small class='sug-type'>{{suggestion.type}}</small>
            </a>
          </li>
        </ul>
      </div>
      <div v-if='suggestionsLoaded && !suggestions.length && !loading && !error' class='no-results msg'>
        No se encontraron ciudades. Intenta con otro nombre.
      </div>
      <div v-if='noRoads' class='no-results msg'>
        No se encontraron calles. Prueba otra ubicación.
      </div>
    </div>

    <div v-if='error' class='error msg'>
      <div v-if='isServerError(error)'>
        <div class='err-t'>Servidores sin respuesta</div>
        <div class='err-d'>Intentamos {{error.serversAttempted || 'varios'}} servidores. Inténtalo en unos minutos.</div>
        <a href='#' @click.prevent='retry' class='retry-btn'>↺ Reintentar</a>
      </div>
      <div v-else>
        <div class='err-t'>Algo salió mal</div>
        <div class='err-d'>{{error.message || error.toString()}}</div>
        <a href='#' @click.prevent='retry' class='retry-btn'>↺ Reintentar</a>
      </div>
    </div>

    <div v-if='loading' class='loading msg'>
      <loading-icon></loading-icon>
      <span class='loading-txt'>{{loading}}</span>
      <a href='#' @click.prevent='cancelRequest' class='cancel-x'>✕ cancelar</a>
      <div class='load-extra' v-if='stillLoading > 0'>Aún cargando…</div>
      <div class='load-extra' v-if='stillLoading > 1'>Disculpa la espera, son muchos datos.</div>
    </div>
  </div>

  <div v-if='boxInTheMiddle' class='made-by'>
    Por <strong>@anvaka</strong> ·
    Datos <a href='https://www.openstreetmap.org/about/' target='_blank'>© OpenStreetMap</a>
  </div>
</div>
</template>

<script>
import LoadingIcon from './LoadingIcon.vue';
import Query from '../lib/Query.js';
import request from '../lib/request.js';
import findBoundaryByName from '../lib/findBoundaryByName.js';
import appState from '../lib/appState.js';
import Grid from '../lib/Grid.js';
import queryState from '../lib/appState.js';
import config from '../config.js';
import Progress from '../lib/Progress.js'
import LoadOptions from '../lib/LoadOptions.js';
import Pbf from 'pbf';
import {place} from '../proto/place.js';

const FIND_TEXT = 'Find City Bounds';

export default {
  name: 'FindPlace',
  components: { LoadingIcon },
  data () {
    const enteredInput = appState.get('q') || '';
    let hasValidArea = restoreStateFromQueryString();
    return {
      enteredInput,
      loading: null,
      lastCancel: null,
      suggestionsLoaded: false,
      boxInTheMiddle: true,
      stillLoading: 0,
      error: null,
      hideInput: false,
      noRoads: false,
      clicked: false,
      showWarning: hasValidArea,
      mainActionText: hasValidArea ? 'Download Area' : FIND_TEXT,
      suggestions: [],
      isFocused: false,
    }
  },
  watch: {
    enteredInput() {
      this.mainActionText = FIND_TEXT;
      this.showWarning = false;
      this.hideInput = false;
      appState.unsetPlace();
    }
  },
  mounted() {
    this.$refs.input.focus();
    if (queryState.get('auto')) this.onSubmit();
  },
  beforeUnmount() {
    if (this.lastCancel) this.lastCancel();
    clearInterval(this.notifyStillLoading);
  },
  methods: {
    onSubmit() {
      queryState.set('q', this.enteredInput);
      this.cancelRequest();
      this.suggestions = [];
      this.noRoads = false;
      this.error = false;
      this.showWarning = false;
      const restoredState = restoreStateFromQueryString(this.enteredInput);
      if (restoredState) { this.pickSuggestion(restoredState); return; }
      this.loading = 'Buscando ciudades…';
      findBoundaryByName(this.enteredInput).then(suggestions => {
        this.loading = null;
        this.hideInput = suggestions && suggestions.length;
        if (this.boxInTheMiddle) {
          this.boxInTheMiddle = false;
          setTimeout(() => { this.suggestionsLoaded = true; this.suggestions = suggestions; }, 50);
        } else {
          this.suggestionsLoaded = true;
          this.suggestions = suggestions;
        }
      });
    },
    isServerError(error) {
      if (!error) return false;
      return error.allServersFailed || error.invalidResponse || error.statusError ||
             (error.message && error.message.includes('Failed to download'));
    },
    updateProgress(status) {
      this.stillLoading = 0;
      clearInterval(this.notifyStillLoading);
      if (status.loaded < 0) { this.loading = 'Probando otro servidor…'; this.restartLoadingMonitor(); return; }
      if (status.percent !== undefined) {
        this.loading = 'Descargado ' + Math.round(100 * status.percent) + '% (' + formatNumber(status.loaded) + ' bytes)…';
      } else {
        this.loading = 'Descargado ' + formatNumber(status.loaded) + ' bytes…';
      }
    },
    retry() { if (this.lastSuggestion) this.pickSuggestion(this.lastSuggestion); },
    pickSuggestion(suggestion) {
      this.lastSuggestion = suggestion;
      this.error = false;
      if (appState.isCacheEnabled() && suggestion.areaId) {
        this.checkCache(suggestion).catch(error => {
          if (error.cancelled) return;
          return this.useOSM(suggestion);
        });
      } else {
        this.useOSM(suggestion);
      }
    },
    restartLoadingMonitor() {
      clearInterval(this.notifyStillLoading);
      this.stillLoading = 0;
      this.notifyStillLoading = setInterval(() => { this.stillLoading++; }, 10000);
    },
    checkCache(suggestion) {
      this.loading = 'Verificando caché…';
      let areaId = suggestion.areaId;
      return request(config.areaServer + '/' + areaId + '.pbf', {
        progress: this.generateNewProgressToken(), responseType: 'arraybuffer'
      }).then(arrayBuffer => {
        var pbf = new Pbf(new Uint8Array(arrayBuffer));
        let grid = Grid.fromPBF(place.read(pbf));
        this.$emit('loaded', grid);
      });
    },
    useOSM(suggestion) {
      this.loading = 'Conectando a OpenStreetMap…';
      this.restartLoadingMonitor();
      Query.runFromOptions(new LoadOptions({
        wayFilter: Query.Road,
        areaId: suggestion.areaId,
        bbox: suggestion.bbox
      }), this.generateNewProgressToken())
      .then(grid => {
        this.loading = null;
        if (!grid.hasRoads()) {
          this.noRoads = true;
        } else {
          grid.setName(suggestion.name);
          grid.setId(suggestion.areaId || suggestion.osm_id);
          grid.setIsArea(suggestion.areaId);
          grid.setBBox(serializeBBox(suggestion.bbox));
          this.$emit('loaded', grid);
        }
      }).catch(err => {
        if (err.cancelled) { this.loading = null; return; }
        this.error = err;
        this.loading = null;
        this.suggestions = [];
      }).finally(() => { clearInterval(this.notifyStillLoading); this.stillLoading = 0; });
    },
    cancelRequest() {
      if (this.progressToken) { this.progressToken.cancel(); this.progressToken = null; this.loading = false; }
    },
    generateNewProgressToken() {
      if (this.progressToken) { this.progressToken.cancel(); this.progressToken = null; }
      this.progressToken = new Progress(this.updateProgress);
      return this.progressToken;
    }
  }
}

function serializeBBox(bbox) { return bbox && bbox.join(','); }
function formatNumber(x) {
  if (!Number.isFinite(x)) return 'N/A';
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function restoreStateFromQueryString(name) {
  let areaId = getCurrentAreaId();
  if (areaId) return {name, areaId};
  let nodeAndBox = getCurrentNodeAndBox();
  if (nodeAndBox) return { name, osm_id: nodeAndBox.osm_id, bbox: nodeAndBox.bbox };
}
function getCurrentAreaId() {
  let areaId = appState.get('areaId');
  if (!Number.isFinite(Number.parseInt(areaId, 10))) areaId = null;
  return areaId;
}
function getCurrentNodeAndBox() {
  let osm_id = appState.get('osm_id');
  if (!Number.isFinite(Number.parseInt(osm_id, 10))) return;
  let bbox = parseBBox(appState.get('bbox'));
  if (!bbox) return;
  return { osm_id, bbox };
}
function parseBBox(bboxStr) {
  if (!bboxStr) return null;
  let bbox = bboxStr.split(',').map(x => Number.parseFloat(x)).filter(x => Number.isFinite(x));
  return bbox.length === 4 ? bbox : null;
}
</script>

<style lang="stylus">
@import('../vars.styl');

.find-place {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  top: 8px;
  left: 50%;
  transform: translateX(-50%) translateY(0);
  transition-timing-function: ease-out;
  transition-property: top left transform;
  transition-duration: 0.3s;
  width: 520px;
  max-width: calc(100vw - 32px);
  pointer-events: none;
  > * { pointer-events: auto; }
}

.find-place.centered {
  top: 50%;
  transform: translateX(-50%) translateY(-50%);
}

/* Hero */
.hero-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 32px;
  animation: fadeUp 0.55s ease both;
}

.hero-chip {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: highlight-color;
  background: highlight-dim;
  border: 1px solid rgba(232,255,71,0.22);
  padding: 4px 14px;
  border-radius: 20px;
  margin-bottom: 22px;
}

.hero-title {
  font-size: clamp(52px, 10.5vw, 128px);
  font-weight: 800;
  line-height: 0.87;
  letter-spacing: -0.04em;
  text-align: center;
  color: primary-text;
  margin: 0;
  animation: fadeUp 0.55s 0.07s ease both;
  em {
    font-style: italic;
    color: highlight-color;
  }
}

.hero-sub {
  margin-top: 18px;
  font-size: clamp(13px, 2vw, 15px);
  color: secondary-color;
  text-align: center;
  animation: fadeUp 0.55s 0.14s ease both;
}

.made-by {
  margin-top: 28px;
  font-size: 11px;
  color: hint-color;
  text-align: center;
  letter-spacing: 0.02em;
  animation: fadeUp 0.55s 0.28s ease both;
  strong { color: secondary-color; font-weight: 500; }
  a { color: hint-color; text-decoration: none; }
}

/* Search wrap */
.search-wrap {
  width: 100%;
  animation: fadeUp 0.55s 0.21s ease both;
}

.search-box {
  display: flex;
  align-items: center;
  background: panel-color;
  border: 1px solid border-color;
  border-radius: radius;
  height: 54px;
  padding: 0 0 0 16px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 4px 32px rgba(0,0,0,0.55);
  transition: border-color 0.2s, box-shadow 0.2s;
  &.focused {
    border-color: rgba(232,255,71,0.38);
    box-shadow: 0 0 0 3px highlight-dim, 0 4px 32px rgba(0,0,0,0.55);
  }
}

.srch-icon {
  color: secondary-color;
  font-size: 20px;
  margin-right: 10px;
  flex-shrink: 0;
}

input.query-input {
  flex: 1;
  border: none;
  background: transparent;
  color: primary-text;
  font-family: labels-font;
  font-size: max(16px, 1em);
  height: 100%;
  outline: none;
  padding: 0;
  &::placeholder { color: hint-color; }
}

.search-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 22px;
  min-width: 80px;
  font-family: labels-font;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #0a0a0f;
  background: highlight-color;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 0 calc(radius - 2px) calc(radius - 2px) 0;
  text-decoration: none;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
  &:hover { background: #f5ff6e; color: #0a0a0f; }
  &:active { background: #d4e83d; }
}

/* Suggestions */
.suggestions {
  margin-top: 6px;
  background: panel-color;
  border: 1px solid border-color;
  border-radius: radius;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
}

.sug-head {
  padding: 9px 14px;
  font-size: 10px;
  font-family: mono-font;
  color: secondary-color;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-bottom: 1px solid border-color;
}

ul.sug-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
}

a.suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  cursor: pointer;
  border-bottom: 1px solid border-color;
  transition: background 0.12s;
  min-height: 48px;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  &:last-child { border-bottom: none; }
  &:hover, &:active {
    background: rgba(232,255,71,0.06);
    .sug-name { color: highlight-color; }
  }
}

.sug-name {
  font-size: 13px;
  font-weight: 500;
  flex: 1;
  margin-right: 10px;
  color: primary-text;
  transition: color 0.12s;
}

.sug-type {
  font-size: 10px;
  font-family: mono-font;
  color: hint-color;
  background: rgba(255,255,255,0.05);
  padding: 3px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* Messages */
.msg {
  margin-top: 6px;
  padding: 13px 16px;
  border-radius: radius;
  background: panel-color;
  border: 1px solid border-color;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  font-size: 13px;
  color: secondary-color;
}

.no-results { text-align: center; }

.prompt-note {
  margin-top: 6px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(232,255,71,0.06);
  border: 1px solid rgba(232,255,71,0.15);
  font-size: 11px;
  color: rgba(232,255,71,0.7);
  font-family: mono-font;
}

.loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: secondary-color;
  position: relative;
  svg { flex-shrink: 0; }
}

.loading-txt { flex: 1; font-size: 13px; }

.cancel-x {
  font-size: 11px;
  color: hint-color;
  font-family: mono-font;
  text-decoration: none;
  padding: 4px;
  transition: color 0.15s;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 0;
  &:hover { color: #ff7777; }
}

.load-extra {
  font-size: 11px;
  color: hint-color;
  font-family: mono-font;
  padding-left: 4px;
}

.error {
  border-color: rgba(255,85,85,0.18);
  background: rgba(255,85,85,0.06);
  color: #ffaaaa;
}

.err-t {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 5px;
  color: #ffcccc;
}

.err-d {
  font-size: 11px;
  color: rgba(255,170,170,0.6);
  font-family: mono-font;
  margin-bottom: 12px;
}

a.retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-family: labels-font;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: #ffaaaa;
  background: rgba(255,85,85,0.12);
  border: 1px solid rgba(255,85,85,0.22);
  border-radius: 8px;
  text-decoration: none;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
  &:hover { background: rgba(255,85,85,0.22); color: #ffaaaa; }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: small-screen) {
  .find-place { width: calc(100vw - 32px); }
  .find-place.centered { top: 50%; }
  .hero-title { font-size: clamp(44px, 14vw, 72px); }
}
</style>
