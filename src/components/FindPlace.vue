<template>
<div class='find-place' :class='{centered: boxInTheMiddle}'>

  <transition name='hero-fade'>
    <div v-if='boxInTheMiddle' class='hero'>
      <div class='hero-tag'>Map Art Generator</div>
      <h1 class='site-header'>city<br><em>roads</em></h1>
      <p class='description'>Every road. Any city. One stunning render.</p>
    </div>
  </transition>

  <form v-on:submit.prevent="onSubmit" class='search-box'>
    <span class='search-icon'>⌕</span>
    <input
      class='query-input'
      v-model='enteredInput'
      type='text'
      placeholder='Enter a city name…'
      ref='input'
      autocomplete='off'
    >
    <a
      type='submit'
      class='search-submit'
      href='#'
      @click.prevent='onSubmit'
      v-if='enteredInput && !hideInput'
    >{{mainActionText}}</a>
  </form>

  <div v-if='showWarning' class='note-banner'>
    ⚠ Large cities may require 200MB+ of data and a powerful device to render.
  </div>

  <div class='results' v-if='!loading'>
    <div v-if='suggestionsLoaded && suggestions.length' class='suggestions'>
      <div class='suggestions-header'>
        <span>Select city boundaries to download</span>
        <span class='note'>large cities may need 200MB+ data</span>
      </div>
      <ul>
        <li v-for='(suggestion, index) in suggestions' :key="index">
          <a @click.prevent='pickSuggestion(suggestion)' class='suggestion' href='#'>
            <span class='sug-name'>{{suggestion.name}}</span>
            <small class='sug-type'>{{suggestion.type}}</small>
          </a>
        </li>
      </ul>
    </div>

    <div v-if='suggestionsLoaded && !suggestions.length && !loading && !error' class='status-msg no-results'>
      No cities found. Try a different query.
    </div>
    <div v-if='noRoads' class='status-msg no-results'>
      No roads found. Try a different area.
    </div>
  </div>

  <div v-if='error' class='status-msg error-msg'>
    <div v-if='isServerError(error)'>
      <div class='err-title'>OpenStreetMap servers are busy</div>
      <div class='err-detail'>Tried {{error.serversAttempted || 'multiple'}} servers. This usually resolves in minutes.</div>
      <a href='#' @click.prevent="retry" class='retry-btn'>↺ Retry</a>
    </div>
    <div v-else>
      <div class='err-title'>Something went wrong</div>
      <div class='err-detail'>{{error.message || error.toString()}}</div>
      <a href='#' @click.prevent="retry" class='retry-btn'>↺ Retry</a>
      <div class='error-links'>
        <a href='https://twitter.com/anvaka/status/1218971717734789120' target="_blank">See how it should work</a>
        <a :href='getBugReportURL(error)' target='_blank'>Report this bug</a>
      </div>
    </div>
  </div>

  <div v-if='loading' class='status-msg loading-msg'>
    <loading-icon></loading-icon>
    <span>{{loading}}</span>
    <a href="#" @click.prevent='cancelRequest' class='cancel-link'>cancel</a>
    <div class='still-loading' v-if='stillLoading > 0'>Still loading…</div>
    <div class='still-loading' v-if='stillLoading > 1'>Sorry, this is taking a while!</div>
  </div>

  <div v-if='boxInTheMiddle' class='made-by'>
    by <strong>Leonardo Cabrera</strong> · data © OpenStreetMap
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

const FIND_TEXT = 'Find boundaries';

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
      mainActionText: hasValidArea ? 'Download area' : FIND_TEXT,
      suggestions: []
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
    if (queryState.get('auto')) { this.onSubmit(); }
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
      this.loading = 'Searching cities…';
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

    getBugReportURL(error) {
      let title = encodeURIComponent('OSM Error');
      let body = error
        ? 'Hello, an error occurred:\n\n```\n' + error.toString() + '\n```\n\nCan you help?'
        : '';
      return `https://github.com/anvaka/city-roads/issues/new?title=${title}&body=${encodeURIComponent(body)}`;
    },

    updateProgress(status) {
      this.stillLoading = 0;
      clearInterval(this.notifyStillLoading);
      if (status.loaded < 0) { this.loading = 'Trying a different server…'; this.restartLoadingMonitor(); return; }
      if (status.percent !== undefined) {
        this.loading = 'Loaded ' + Math.round(100 * status.percent) + '% (' + formatNumber(status.loaded) + ' bytes)…';
      } else {
        this.loading = 'Loaded ' + formatNumber(status.loaded) + ' bytes…';
      }
    },

    retry() { if (this.lastSuggestion) { this.pickSuggestion(this.lastSuggestion); } },

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
      this.loading = 'Checking cache…';
      let areaId = suggestion.areaId;
      return request(config.areaServer + '/' + areaId + '.pbf', {
        progress: this.generateNewProgressToken(),
        responseType: 'arraybuffer'
      }).then(ab => new Uint8Array(ab))
        .then(byteArray => {
          var pbf = new Pbf(byteArray);
          var obj = place.read(pbf);
          let grid = Grid.fromPBF(obj);
          this.$emit('loaded', grid);
        });
    },

    useOSM(suggestion) {
      this.loading = 'Connecting to OpenStreetMap…';
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
        console.error(err);
        this.error = err;
        this.loading = null;
        this.suggestions = [];
      }).finally(() => {
        clearInterval(this.notifyStillLoading);
        this.stillLoading = 0;
      });
    },

    cancelRequest() {
      if (this.progressToken) {
        this.progressToken.cancel();
        this.progressToken = null;
        this.loading = false;
      }
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
  if (nodeAndBox) return {name, osm_id: nodeAndBox.osm_id, bbox: nodeAndBox.bbox};
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
  align-items: stretch;
  top: 16px;
  left: 50%;
  width: desktop-controls-width;
  transform: translateX(-50%) translateY(0);
  transition: top 0.3s ease-out, transform 0.3s ease-out;
}

.find-place.centered {
  top: 50%;
  transform: translateX(-50%) translateY(-220px);
}

/* ── Hero ── */
.hero {
  text-align: center;
  margin-bottom: 28px;
  animation: heroIn 0.6s ease-out both;
}

@keyframes heroIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.hero-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: accent;
  background: accent-dim;
  border: 1px solid rgba(232,255,71,0.25);
  padding: 4px 12px;
  border-radius: 20px;
  margin-bottom: 18px;
}

.site-header {
  margin: 0 0 10px;
  font-size: 64px;
  font-weight: 800;
  line-height: 0.9;
  color: text-primary;
  letter-spacing: -0.03em;
  em {
    font-style: italic;
    color: accent;
    font-weight: 700;
  }
}

.description {
  margin: 0;
  font-size: 15px;
  color: text-secondary;
  font-weight: 400;
  letter-spacing: 0.01em;
}

.hero-fade-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.hero-fade-leave-active { transition: opacity 0.15s ease; }
.hero-fade-enter-from   { opacity: 0; transform: translateY(10px); }
.hero-fade-leave-to     { opacity: 0; }

/* ── Search box ── */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background: panel-bg;
  border: 1px solid panel-border;
  border-radius: 12px;
  height: 52px;
  padding: 0 0 0 14px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus-within {
    border-color: rgba(232,255,71,0.4);
    box-shadow: 0 0 0 3px rgba(232,255,71,0.08), 0 4px 24px rgba(0,0,0,0.4);
  }
}

.search-icon {
  color: text-secondary;
  font-size: 20px;
  margin-right: 8px;
  flex-shrink: 0;
  line-height: 1;
}

input.query-input {
  flex: 1;
  border: none;
  background: transparent;
  color: text-primary;
  font-family: body-font;
  font-size: 16px;
  font-weight: 400;
  height: 100%;
  padding: 0;
  &::placeholder { color: text-muted; }
  &:focus { outline: none; }
}

.search-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 18px;
  font-family: body-font;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: ink;
  background: accent;
  text-decoration: none;
  border-radius: 0 10px 10px 0;
  flex-shrink: 0;
  transition: background 0.15s ease, opacity 0.15s ease;
  &:hover { background: #f5ff6e; }
}

/* ── Warning banner ── */
.note-banner {
  margin-top: 8px;
  padding: 8px 14px;
  font-size: 12px;
  color: #ffcc66;
  background: rgba(255,204,102,0.1);
  border: 1px solid rgba(255,204,102,0.2);
  border-radius: 8px;
}

/* ── Suggestions ── */
.suggestions {
  margin-top: 8px;
  background: panel-bg;
  border: 1px solid panel-border;
  border-radius: 12px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
}

.suggestions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  font-size: 11px;
  color: text-secondary;
  border-bottom: 1px solid panel-border;
  .note {
    font-size: 10px;
    color: text-muted;
    font-style: italic;
  }
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  padding: 10px 14px;
  text-decoration: none;
  border-bottom: 1px solid panel-border;
  transition: background 0.12s ease;

  &:hover {
    background: rgba(232,255,71,0.06);
    .sug-name { color: accent; }
  }

  &:last-child { border-bottom: none; }
}

.sug-name {
  font-size: 14px;
  font-weight: 500;
  color: text-primary;
  transition: color 0.12s ease;
}

.sug-type {
  font-size: 11px;
  color: text-muted;
  font-family: labels-font;
  background: rgba(255,255,255,0.05);
  padding: 2px 8px;
  border-radius: 4px;
}

/* ── Status messages ── */
.status-msg {
  margin-top: 8px;
  padding: 14px 16px;
  border-radius: 12px;
  font-size: 13px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.no-results {
  background: panel-bg;
  border: 1px solid panel-border;
  color: text-secondary;
  text-align: center;
}

.error-msg {
  background: rgba(255, 80, 80, 0.08);
  border: 1px solid rgba(255,80,80,0.2);
  color: #ff9999;

  .err-title { font-weight: 600; font-size: 14px; color: #ffaaaa; margin-bottom: 6px; }
  .err-detail { font-size: 12px; color: rgba(255,153,153,0.7); margin-bottom: 12px; }
}

.loading-msg {
  display: flex;
  align-items: center;
  gap: 10px;
  background: panel-bg;
  border: 1px solid panel-border;
  color: text-secondary;
  position: relative;

  .still-loading {
    font-size: 11px;
    color: text-muted;
    margin-left: auto;
  }
}

.cancel-link {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: text-muted;
  text-decoration: none;
  &:hover { color: #ff6b6b; }
}

.retry-btn {
  display: inline-block;
  padding: 7px 18px;
  background: rgba(255,80,80,0.15);
  border: 1px solid rgba(255,80,80,0.3);
  color: #ff9999;
  text-decoration: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
  &:hover { background: rgba(255,80,80,0.25); }
}

.error-links {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,80,80,0.15);
  font-size: 11px;
  a { color: rgba(255,153,153,0.6); text-decoration: none; &:hover { color: #ffaaaa; } }
}

/* ── Made by footer ── */
.made-by {
  margin-top: 20px;
  text-align: center;
  font-size: 12px;
  color: text-muted;
  letter-spacing: 0.02em;
  strong { color: text-secondary; font-weight: 500; }
}

/* ── Mobile ── */
@media (max-width: small-screen) {
  .find-place {
    width: calc(100% - 24px);
    left: 12px;
    transform: none;
  }
  .find-place.centered {
    top: 20px;
    transform: none;
  }
  .site-header { font-size: 48px; }
}
</style>
