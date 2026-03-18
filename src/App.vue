<template>
  <find-place v-if='!placeFound' @loaded='onGridLoaded'></find-place>

  <div id="app" v-if='placeFound'>
    <!-- Botones principales -->
    <div class='ctrl-row'>
      <a href="#" class='cbtn' :class='{active: showSettings}' @click.prevent='toggleSettings'>
        <span class='cbtn-icon'>⊞</span> Personalizar
      </a>
      <a href="#" class='cbtn danger' @click.prevent='startOver'>
        <span class='cbtn-icon'>↩</span> Nueva ciudad
      </a>
    </div>

    <!-- Panel de ajustes -->
    <div v-if='showSettings' class='settings-panel'>

      <!-- Colores -->
      <div class='ps'>
        <div class='slabel'>Colores</div>
        <div class='cgrid'>
          <div v-for='layer in layers' :key='layer.name' class='ci'>
            <color-picker v-model='layer.color' @change='layer.changeColor' class='cswatch'></color-picker>
            <div class='clabel'>{{layer.name}}</div>
          </div>
        </div>
      </div>

      <div class='pdiv'></div>

      <!-- Exportar -->
      <div class='ps'>
        <div class='slabel'>Exportar</div>
        <a class='xrow' href='#' @click.prevent='toPNGFile'>
          <span class='xicon'>🖼</span>
          <span class='xinfo'>
            <span class='xtitle'>Guardar como imagen (.png)</span>
            <span class='xdesc'>Exportación ráster de la vista actual</span>
          </span>
          <span class='xarrow'>→</span>
        </a>
        <a class='xrow' href='#' @click.prevent='toSVGFile'>
          <span class='xicon'>◈</span>
          <span class='xinfo'>
            <span class='xtitle'>Guardar como vector (.svg)</span>
            <span class='xdesc'>Escalable infinitamente, listo para imprimir</span>
          </span>
          <span class='xarrow'>→</span>
        </a>
      </div>

      <div class='pdiv'></div>

      <div class='ps'>
        <div class='slabel'>Acerca de</div>
        <p class='about-p'>
          Creado por <a href='https://twitter.com/anvaka' target='_blank'>@anvaka</a>.<br>
          Datos de <a href='https://www.openstreetmap.org/about/' target='_blank'>OpenStreetMap</a>, renderizado con WebGL.
        </p>
      </div>

    </div>
  </div>

  <editable-label
    v-if='placeFound'
    v-model='name'
    class='city-name'
    :printable='true'
    :style='{color: labelColorRGBA}'
    :overlay-manager='overlayManager'>
  </editable-label>

  <div v-if='placeFound' class='license printable can-drag' :style='{color: labelColorRGBA}'>
    datos <a href='https://www.openstreetmap.org/about/' target="_blank" :style='{color: labelColorRGBA}'>© OpenStreetMap</a>
  </div>

  <div class='drag-overlay' v-if='overlayManager && overlayManager.isDragging'></div>
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
        if (!name) { lastLayer += 1; name = 'líneas ' + lastLayer; }
        let layerColor = tinycolor.fromRatio(layer.color);
        newLayers.push(new ColorLayer(name, layerColor, newColor => {
          this.zazzleLink = null;
          layer.color = toRatioColor(newColor);
          renderer.renderFrame();
          this.scene.fire('color-change', layer);
        }));
      });
      newLayers.push(
        new ColorLayer('fondo', this.backgroundColor, this.setBackgroundColor),
        new ColorLayer('nombre', this.labelColor, newColor => this.labelColor = newColor)
      );
      this.layers = newLayers;
      function toRatioColor(c) { return {r: c.r/0xff, g: c.g/0xff, b: c.b/0xff, a: c.a}; }
      this.zazzleLink = null;
    },
    syncLineColor() { this.updateLayers(); },
    syncBackground(newBackground) { this.backgroundColor = newBackground.toRgb(); this.updateLayers(); },
    setBackgroundColor(c) {
      this.scene.background = c;
      document.body.style.backgroundColor = toRGBA(c);
      this.zazzleLink = null;
    },
  }
}

function toRGBA(c) { return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`; }
</script>

<style lang='stylus'>
@import('./vars.styl');

#app {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: desktop-controls-width;
  pointer-events: none;
  > * { pointer-events: auto; }
}

.ctrl-row {
  display: flex;
  gap: 6px;
}

.cbtn {
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: labels-font;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: primary-text;
  background: panel-color;
  border: 1px solid border-color;
  border-radius: 10px;
  cursor: pointer;
  text-decoration: none;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: all 0.15s;
  -webkit-tap-highlight-color: transparent;
  &:hover { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.05); color: primary-text; }
  &:active { background: rgba(255,255,255,0.08); }
  &.active { border-color: highlight-color; color: highlight-color; background: highlight-dim; }
  &.danger:hover { border-color: rgba(255,85,85,0.38); color: #ff8888; }
}

.cbtn-icon { font-size: 14px; opacity: 0.65; }

.settings-panel {
  background: panel-color;
  border: 1px solid border-color;
  border-radius: radius;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  overflow: hidden;
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  animation: panelIn 0.18s ease both;
  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
}

.ps { padding: 14px 16px; }
.pdiv { height: 1px; background: border-color; }

.slabel {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: secondary-color;
  font-family: mono-font;
  margin-bottom: 12px;
}

/* Colores */
.cgrid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}
.ci {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.cswatch {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1.5px solid rgba(255,255,255,0.18);
  transition: transform 0.15s, box-shadow 0.15s;
  -webkit-tap-highlight-color: transparent;
  &:hover, &:active {
    transform: scale(1.12);
    box-shadow: 0 0 0 2px highlight-color;
  }
}
.clabel {
  font-size: 9px;
  color: secondary-color;
  font-family: mono-font;
  text-transform: capitalize;
  white-space: nowrap;
}

/* Exportar */
.xrow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid border-color;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.12s;
  min-height: 48px;
  -webkit-tap-highlight-color: transparent;
  &:last-child { border-bottom: none; }
  &:hover .xtitle, &:active .xtitle { color: highlight-color; }
  &:hover .xarrow, &:active .xarrow { opacity: 1; transform: translateX(3px); }
}
.xicon { font-size: 18px; width: 28px; text-align: center; color: secondary-color; flex-shrink: 0; }
.xinfo { flex: 1; }
.xtitle { font-size: 13px; font-weight: 500; color: primary-text; display: block; transition: color 0.12s; }
.xdesc { font-size: 11px; color: secondary-color; font-family: mono-font; }
.xarrow { color: secondary-color; opacity: 0.35; transition: all 0.15s; }

.about-p {
  font-size: 12px;
  color: secondary-color;
  line-height: 1.65;
  a { color: highlight-color; text-decoration: none; }
}

/* Etiquetas */
.city-name {
  position: fixed;
  right: 32px;
  bottom: 52px;
  font-family: labels-font;
  font-size: clamp(20px, 3vw, 30px);
  font-weight: 800;
  letter-spacing: -0.025em;
  text-shadow: 0 2px 24px rgba(0,0,0,0.8);
  input { font-size: inherit; font-family: inherit; font-weight: inherit; }
}

.license {
  text-align: right;
  position: fixed;
  font-family: mono-font;
  right: 32px;
  bottom: 18px;
  font-size: 11px;
  opacity: 0.4;
  a { text-decoration: none; color: inherit; }
}

.can-drag { border: 1px solid transparent; }
.drag-overlay { position: fixed; background: transparent; left: 0; top: 0; right: 0; bottom: 0; }

@keyframes panelIn {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: small-screen) {
  #app { width: calc(100vw - 24px); left: 12px; top: 12px; }
  .city-name { right: 12px; bottom: 36px; font-size: 20px; }
  .license { right: 12px; bottom: 10px; }
}
</style>
