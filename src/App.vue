<template>
  <find-place v-if='!placeFound' @loaded='onGridLoaded'></find-place>
  <div id="app">
    <div v-if='placeFound'>
      <div class='controls'>
        <button class='ctrl-btn ctrl-customize' @click='toggleSettings' :class='{active: showSettings}'>
          <span class='btn-icon'>⊞</span>
          <span>Customize</span>
        </button>
        <button class='ctrl-btn ctrl-reset' @click='startOver'>
          <span class='btn-icon'>↩</span>
          <span>New city</span>
        </button>
      </div>

      <transition name='panel-slide'>
        <div v-if='showSettings' class='print-window'>
          <div class='panel-section'>
            <div class='section-label'>Display</div>
            <div class='colors-grid'>
              <div v-for='layer in layers' :key='layer.name' class='color-item'>
                <color-picker v-model='layer.color' @change='layer.changeColor'></color-picker>
                <div class='color-label'>{{layer.name}}</div>
              </div>
            </div>
          </div>

          <div class='panel-divider'></div>

          <div class='panel-section'>
            <div class='section-label'>Export</div>

            <a href='#' @click.prevent='zazzleMugPrint()' class='export-row'>
              <span class='export-icon'>☕</span>
              <span class='export-info'>
                <span class='export-title'>Print on a mug</span>
                <span class='export-desc'>A unique gift of your favorite city</span>
              </span>
              <span class='export-arrow'>→</span>
            </a>

            <div class='preview-actions' v-if='zazzleLink || generatingPreview'>
              <div v-if='zazzleLink' class='popup-help'>
                If blocked, <a :href='zazzleLink' target='_blank'>click here</a> to open.
              </div>
              <div v-if='generatingPreview' class='loading-container'>
                <loading-icon></loading-icon>
                <span>Generating preview…</span>
              </div>
            </div>

            <a href='#' @click.prevent='toPNGFile' class='export-row'>
              <span class='export-icon'>🖼</span>
              <span class='export-info'>
                <span class='export-title'>Save as image (.png)</span>
                <span class='export-desc'>Raster export of current view</span>
              </span>
              <span class='export-arrow'>→</span>
            </a>

            <a href='#' @click.prevent='toSVGFile' class='export-row'>
              <span class='export-icon'>◈</span>
              <span class='export-info'>
                <span class='export-title'>Save as vector (.svg)</span>
                <span class='export-desc'>Infinitely scalable, print-ready</span>
              </span>
              <span class='export-arrow'>→</span>
            </a>
          </div>

          <div class='panel-divider'></div>

          <div class='panel-section panel-about'>
            <div class='section-label'>About</div>
            <p>
              Made by <a href='https://github.com/anvaka/city-roads' target='_blank'>@anvaka</a> · 
              Redesigned by <strong>Leonardo Cabrera</strong>.
            </p>
            <p>
              Roads from <a href='https://www.openstreetmap.org/about/' target='_blank'>OpenStreetMap</a>, 
              rendered with WebGL.
            </p>
          </div>
        </div>
      </transition>
    </div>
  </div>

  <editable-label
    v-if='placeFound'
    v-model='name'
    class='city-name'
    :printable='true'
    :style='{color: labelColorRGBA}'
    :overlay-manager='overlayManager'
  ></editable-label>

  <div v-if='placeFound' class='license printable can-drag' :style='{color: labelColorRGBA}'>
    data <a href='https://www.openstreetmap.org/about/' target="_blank" :style='{color: labelColorRGBA}'>© OpenStreetMap</a>
    · <span class='made-by-badge'>city roads</span>
  </div>
</template>

<script>
import FindPlace from './components/FindPlace.vue';
import LoadingIcon from './components/LoadingIcon.vue';
import EditableLabel from './components/EditableLabel.vue';
import ColorPicker from './components/ColorPicker.vue';
import createScene from './lib/createScene.js';
import GridLayer from './lib/GridLayer.js';
import generateZazzleLink from './lib/getZazzleLink.js';
import appState from './lib/appState.js';
import {getPrintableCanvas, getCanvas} from './lib/saveFile.js';
import config from './config.js';
import './lib/canvas2BlobPolyfill.js';
import bus from './lib/bus.js';
import createOverlayManager from './createOverlayManager.js';
import tinycolor from 'tinycolor2';

class ColorLayer {
  constructor(name, color, callback) {
    this.name = name;
    this.changeColor = callback;
    this.color = color;
  }
}

export default {
  name: 'App',
  components: { FindPlace, LoadingIcon, EditableLabel, ColorPicker },
  data() {
    return {
      placeFound: false,
      name: '',
      zazzleLink: null,
      generatingPreview: false,
      showSettings: false,
      settingsOpen: false,
      labelColor: config.getLabelColor().toRgb(),
      backgroundColor: config.getBackgroundColor().toRgb(),
      layers: []
    }
  },
  computed: {
    labelColorRGBA() { return toRGBA(this.labelColor); }
  },
  created() {
    bus.on('scene-transform', this.handleSceneTransform);
    bus.on('background-color', this.syncBackground);
    bus.on('line-color', this.syncLineColor);
    this.overlayManager = createOverlayManager();
  },
  beforeUnmount() {
    debugger;
    this.overlayManager.dispose();
    this.dispose();
    bus.off('scene-transform', this.handleSceneTransform);
    bus.off('background-color', this.syncBackground);
    bus.off('line-color', this.syncLineColor);
  },
  methods: {
    dispose() {
      if (this.scene) { this.scene.dispose(); window.scene = null; }
    },
    toggleSettings() { this.showSettings = !this.showSettings; },
    handleSceneTransform() { this.zazzleLink = null; },

    onGridLoaded(grid) {
      if (grid.isArea) {
        appState.set('areaId', grid.id);
        appState.unset('osm_id');
        appState.unset('bbox');
      } else if (grid.bboxString) {
        appState.unset('areaId');
        appState.set('osm_id', grid.id);
        appState.set('bbox', grid.bboxString);
      }
      this.placeFound = true;
      this.name = grid.name.split(',')[0];
      let canvas = getCanvas();
      canvas.style.visibility = 'visible';
      this.scene = createScene(canvas);
      this.scene.on('layer-added', this.updateLayers);
      this.scene.on('layer-removed', this.updateLayers);
      window.scene = this.scene;
      let gridLayer = new GridLayer();
      gridLayer.id = 'lines';
      gridLayer.setGrid(grid);
      this.scene.add(gridLayer);
    },

    startOver() {
      appState.unset('areaId');
      appState.unsetPlace();
      appState.unset('q');
      appState.enableCache();
      this.dispose();
      this.placeFound = false;
      this.zazzleLink = null;
      this.showSettings = false;
      this.backgroundColor = config.getBackgroundColor().toRgb();
      this.labelColor = config.getLabelColor().toRgb();
      document.body.style.backgroundColor = config.getBackgroundColor().toRgbString();
      getCanvas().style.visibility = 'hidden';
    },

    toPNGFile() { scene.saveToPNG(this.name); },
    toSVGFile() { scene.saveToSVG(this.name); },

    updateLayers() {
      let newLayers = [];
      let lastLayer = 0;
      let renderer = this.scene.getRenderer();
      let root = renderer.getRoot();
      root.children.forEach(layer => {
        if (!layer.color) return;
        let name = layer.id;
        if (!name) { lastLayer += 1; name = 'lines ' + lastLayer; }
        let layerColor = tinycolor.fromRatio(layer.color);
        newLayers.push(new ColorLayer(name, layerColor, newColor => {
          this.zazzleLink = null;
          layer.color = toRatioColor(newColor);
          renderer.renderFrame();
          this.scene.fire('color-change', layer);
        }));
      });
      newLayers.push(
        new ColorLayer('background', this.backgroundColor, this.setBackgroundColor),
        new ColorLayer('labels', this.labelColor, newColor => this.labelColor = newColor)
      );
      this.layers = newLayers;
      function toRatioColor(c) { return {r: c.r/0xff, g: c.g/0xff, b: c.b/0xff, a: c.a} }
      this.zazzleLink = null;
    },

    syncLineColor() { this.updateLayers(); },
    syncBackground(newBackground) {
      this.backgroundColor = newBackground.toRgb();
      this.updateLayers();
    },
    updateBackground() { this.setBackgroundColor(this.backgroundColor); this.zazzleLink = null; },
    setBackgroundColor(c) {
      this.scene.background = c;
      document.body.style.backgroundColor = toRGBA(c);
      this.zazzleLink = null;
    },

    zazzleMugPrint() {
      if (this.zazzleLink) {
        window.open(this.zazzleLink, '_blank');
        recordOpenClick(this.zazzleLink);
        return;
      }
      this.generatingPreview = true;
      getPrintableCanvas(this.scene).then(printableCanvas => {
        generateZazzleLink(printableCanvas).then(link => {
          this.zazzleLink = link;
          window.open(link, '_blank');
          recordOpenClick(link);
          this.generatingPreview = false;
        }).catch(e => {
          this.error = e;
          this.generatingPreview = false;
        });
      });
    }
  }
}

function toRGBA(c) { return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`; }
function recordOpenClick(link) {
  if (typeof gtag === 'undefined') return;
  gtag('event', 'click', { 'event_category': 'Outbound Link', 'event_label': link });
}
</script>

<style lang='stylus'>
@import('./vars.styl');

#app {
  margin: 12px;
  max-height: 100vh;
  position: absolute;
  z-index: 10;
}

.can-drag {
  border: 1px solid transparent;
}

.drag-overlay {
  position: fixed;
  background: transparent;
  left: 0; top: 0; right: 0; bottom: 0;
}

.overlay-active {
  border: 1px dashed accent;
}
.overlay-active.exclusive {
  border-style: solid;
}

/* ── Control bar ── */
.controls {
  display: flex;
  gap: 6px;
  width: desktop-controls-width;
}

.ctrl-btn {
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid panel-border;
  background: panel-bg;
  color: text-primary;
  font-family: body-font;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  border-radius: 10px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: all 0.18s ease;

  &:hover {
    border-color: rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.06);
  }

  &.active {
    border-color: accent;
    color: accent;
    background: accent-dim;
  }

  .btn-icon {
    font-size: 15px;
    opacity: 0.7;
  }
}

.ctrl-reset:hover {
  color: #ff6b6b;
  border-color: rgba(255,107,107,0.4);
}

/* ── Settings panel ── */
.print-window {
  margin-top: 6px;
  width: desktop-controls-width;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  background: panel-bg;
  border: 1px solid panel-border;
  border-radius: 14px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  overflow: hidden;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.panel-section {
  padding: 16px 18px;
}

.panel-divider {
  height: 1px;
  background: panel-border;
  margin: 0 18px;
}

.section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: text-secondary;
  margin-bottom: 12px;
}

/* ── Colors grid ── */
.colors-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.color-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.color-label {
  font-size: 10px;
  color: text-secondary;
  font-family: labels-font;
  text-transform: capitalize;
  letter-spacing: 0.03em;
}

/* ── Export rows ── */
.export-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid panel-border;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    .export-icon { color: accent; }
    .export-title { color: accent; }
    .export-arrow { opacity: 1; transform: translateX(2px); }
  }
}

.export-icon {
  font-size: 18px;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
  color: text-secondary;
  transition: color 0.15s ease;
}

.export-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.export-title {
  font-size: 13px;
  font-weight: 500;
  color: text-primary;
  transition: color 0.15s ease;
}

.export-desc {
  font-size: 11px;
  color: text-secondary;
  font-family: labels-font;
}

.export-arrow {
  color: text-secondary;
  font-size: 14px;
  opacity: 0.5;
  transition: all 0.15s ease;
}

/* ── Preview / loading ── */
.preview-actions {
  padding: 10px 0;
  font-size: 12px;
  color: text-secondary;

  .popup-help {
    padding: 8px 10px;
    background: accent-dim;
    border: 1px solid rgba(232,255,71,0.2);
    border-radius: 6px;
    margin-bottom: 8px;
    a { color: accent; }
  }

  .loading-container {
    display: flex;
    align-items: center;
    gap: 8px;
    color: text-secondary;
  }
}

/* ── About ── */
.panel-about {
  p {
    margin: 0 0 6px;
    font-size: 12px;
    color: text-secondary;
    line-height: 1.6;
  }
  a {
    color: accent;
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }
  strong {
    color: text-primary;
    font-weight: 600;
  }
}

/* ── City name label ── */
.city-name {
  position: absolute;
  right: 32px;
  bottom: 54px;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.01em;
  font-family: body-font;
  input {
    font-size: 28px;
    font-family: body-font;
    font-weight: 700;
  }
}

/* ── License ── */
.license {
  text-align: right;
  position: fixed;
  font-family: labels-font;
  font-size: 11px;
  right: 32px;
  bottom: 28px;
  padding-right: 8px;
  opacity: 0.7;
  a {
    text-decoration: none;
    display: inline-block;
  }
  .made-by-badge {
    opacity: 0.5;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 9px;
  }
}

/* ── Mobile ── */
@media (max-width: small-screen) {
  #app {
    width: calc(100% - 24px);
    margin: 12px;
  }
  .controls,
  .print-window {
    width: 100%;
  }
  .city-name {
    right: 12px;
    bottom: 28px;
    font-size: 20px;
  }
  .license {
    right: 12px;
    bottom: 10px;
  }
}
</style>
