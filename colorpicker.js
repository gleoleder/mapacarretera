// ─────────────────────────────────────────────────────────────────────────────
//  colorpicker.js — Espectro de color custom, igual en todos los dispositivos
//
//  Reemplaza input[type=color] nativo (que en iOS/Android muestra HSV/HSB)
//  con un picker canvas que siempre muestra el espectro RGB completo.
//
//  Uso:
//    ColorPicker.open(currentHex, anchorElement, onChangeFn, onCloseFn)
//    ColorPicker.close()
// ─────────────────────────────────────────────────────────────────────────────

window.ColorPicker = (function () {
  'use strict';

  // ── Estado interno ──────────────────────────────────────────────────────────
  let overlay, popup, specCanvas, specCtx, hueCanvas, hueCtx,
      cursor, hueCursor, hexInput, previewBox;
  let currentH = 0, currentS = 1, currentV = 1;
  let draggingSpec = false, draggingHue = false;
  let onChangeCb = null, onCloseCb = null;
  let built = false;

  // ── Helpers HSV ↔ HEX ──────────────────────────────────────────────────────
  function hsvToRgb(h, s, v) {
    let r, g, b, i = Math.floor(h * 6),
        f = h * 6 - i, p = v * (1 - s),
        q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r=v; g=t; b=p; break; case 1: r=q; g=v; b=p; break;
      case 2: r=p; g=v; b=t; break; case 3: r=p; g=q; b=v; break;
      case 4: r=t; g=p; b=v; break; case 5: r=v; g=p; b=q; break;
    }
    return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
    let h = 0, s = max === 0 ? 0 : d/max, v = max;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g-b)/d + (g<b?6:0)) / 6; break;
        case g: h = ((b-r)/d + 2) / 6; break;
        case b: h = ((r-g)/d + 4) / 6; break;
      }
    }
    return [h, s, v];
  }

  function hexToRgb(hex) {
    hex = hex.replace('#','');
    if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  }

  function currentHex() {
    const [r,g,b] = hsvToRgb(currentH, currentS, currentV);
    return rgbToHex(r, g, b);
  }

  // ── Dibujar espectro (SV con H fijo) ────────────────────────────────────────
  function drawSpectrum() {
    const w = specCanvas.width, h = specCanvas.height;
    // Gradiente horizontal: blanco → color puro del hue actual
    const gradH = specCtx.createLinearGradient(0, 0, w, 0);
    const [pr,pg,pb] = hsvToRgb(currentH, 1, 1);
    gradH.addColorStop(0, '#ffffff');
    gradH.addColorStop(1, `rgb(${pr},${pg},${pb})`);
    specCtx.fillStyle = gradH;
    specCtx.fillRect(0, 0, w, h);
    // Gradiente vertical: transparente → negro
    const gradV = specCtx.createLinearGradient(0, 0, 0, h);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, 'rgba(0,0,0,1)');
    specCtx.fillStyle = gradV;
    specCtx.fillRect(0, 0, w, h);
  }

  // ── Dibujar barra de hue ────────────────────────────────────────────────────
  function drawHue() {
    const w = hueCanvas.width, h = hueCanvas.height;
    const grad = hueCtx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 360; i += 30) {
      const [r,g,b] = hsvToRgb(i/360, 1, 1);
      grad.addColorStop(i/360, `rgb(${r},${g},${b})`);
    }
    hueCtx.fillStyle = grad;
    hueCtx.fillRect(0, 0, w, h);
  }

  // ── Actualizar cursores ─────────────────────────────────────────────────────
  function updateCursors() {
    // Cursor del espectro
    const sw = specCanvas.offsetWidth, sh = specCanvas.offsetHeight;
    const cx = currentS * sw, cy = (1 - currentV) * sh;
    cursor.style.left = (cx - 8) + 'px';
    cursor.style.top  = (cy - 8) + 'px';
    // Cursor del hue
    const hw = hueCanvas.offsetWidth;
    hueCursor.style.left = (currentH * hw - 6) + 'px';
    // Color del cursor del espectro
    const [r,g,b] = hsvToRgb(currentH, currentS, currentV);
    const lum = (r*299 + g*587 + b*114) / 1000;
    cursor.style.borderColor = lum > 128 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)';
    // Preview y hex input
    const hex = rgbToHex(r, g, b);
    previewBox.style.background = hex;
    if (document.activeElement !== hexInput) hexInput.value = hex;
  }

  // ── Emitir cambio ──────────────────────────────────────────────────────────
  function emit() {
    if (onChangeCb) onChangeCb(currentHex());
  }

  // ── Manejo de eventos del espectro ─────────────────────────────────────────
  function specPos(e) {
    const rect = specCanvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return {
      x: Math.max(0, Math.min(1, (src.clientX - rect.left)  / rect.width)),
      y: Math.max(0, Math.min(1, (src.clientY - rect.top)   / rect.height)),
    };
  }
  function onSpecDown(e) {
    e.preventDefault(); draggingSpec = true;
    const p = specPos(e); currentS = p.x; currentV = 1 - p.y;
    updateCursors(); emit();
  }
  function onSpecMove(e) {
    if (!draggingSpec) return; e.preventDefault();
    const p = specPos(e); currentS = p.x; currentV = 1 - p.y;
    updateCursors(); emit();
  }

  // ── Manejo de eventos del hue ───────────────────────────────────────────────
  function huePos(e) {
    const rect = hueCanvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return Math.max(0, Math.min(1, (src.clientX - rect.left) / rect.width));
  }
  function onHueDown(e) {
    e.preventDefault(); draggingHue = true;
    currentH = huePos(e);
    drawSpectrum(); updateCursors(); emit();
  }
  function onHueMove(e) {
    if (!draggingHue) return; e.preventDefault();
    currentH = huePos(e);
    drawSpectrum(); updateCursors(); emit();
  }

  // ── Stop drag ──────────────────────────────────────────────────────────────
  function onUp() { draggingSpec = false; draggingHue = false; }

  // ── Construir DOM (una sola vez) ───────────────────────────────────────────
  function build() {
    if (built) return;
    built = true;

    // Estilos
    const style = document.createElement('style');
    style.textContent = `
      #cp-overlay {
        position: fixed; inset: 0; z-index: 9000;
        display: none; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
        padding: 16px;
        touch-action: none;
      }
      #cp-overlay.open { display: flex; }

      #cp-popup {
        background: #1a1a22;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 16px;
        padding: 16px;
        width: min(320px, calc(100vw - 32px));
        box-shadow: 0 24px 64px rgba(0,0,0,0.7);
        display: flex; flex-direction: column; gap: 12px;
        user-select: none; -webkit-user-select: none;
      }

      /* Espectro SV */
      #cp-spec-wrap {
        position: relative;
        width: 100%; aspect-ratio: 1 / 0.65;
        border-radius: 10px; overflow: hidden; cursor: crosshair;
        touch-action: none;
      }
      #cp-spec {
        width: 100%; height: 100%; display: block;
        border-radius: 10px;
      }
      #cp-cursor {
        position: absolute; width: 16px; height: 16px;
        border-radius: 50%; border: 2px solid white;
        box-shadow: 0 0 4px rgba(0,0,0,0.6);
        pointer-events: none; transform: none;
        transition: border-color 0.1s;
      }

      /* Barra de hue */
      #cp-hue-wrap {
        position: relative; width: 100%; height: 20px;
        border-radius: 10px; overflow: visible; cursor: pointer;
        touch-action: none;
      }
      #cp-hue {
        width: 100%; height: 100%; display: block;
        border-radius: 10px;
      }
      #cp-hue-cursor {
        position: absolute; top: 50%;
        width: 12px; height: 26px;
        transform: translateY(-50%);
        background: white;
        border: 2px solid rgba(0,0,0,0.3);
        border-radius: 4px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        pointer-events: none;
      }

      /* Fila inferior: preview + hex input + botones */
      #cp-bottom {
        display: flex; align-items: center; gap: 10px;
      }
      #cp-preview {
        width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
        border: 1.5px solid rgba(255,255,255,0.15);
      }
      #cp-hex {
        flex: 1; height: 40px; background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
        color: #eeede6; font-family: 'DM Mono', monospace; font-size: 14px;
        text-align: center; outline: none; letter-spacing: 0.05em;
        padding: 0 10px;
        -webkit-appearance: none;
      }
      #cp-hex:focus { border-color: rgba(232,255,71,0.5); }

      /* Botones */
      #cp-btns { display: flex; gap: 8px; }
      .cp-btn {
        flex: 1; height: 40px; border: none; border-radius: 10px;
        font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700;
        letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
        -webkit-tap-highlight-color: transparent; transition: opacity 0.15s;
      }
      .cp-btn:active { opacity: 0.75; }
      #cp-cancel { background: rgba(255,255,255,0.07); color: rgba(238,237,230,0.5); }
      #cp-confirm { background: #e8ff47; color: #0a0a0f; }
    `;
    document.head.appendChild(style);

    // Overlay
    overlay = document.createElement('div');
    overlay.id = 'cp-overlay';

    // Popup
    popup = document.createElement('div');
    popup.id = 'cp-popup';

    // Espectro
    const specWrap = document.createElement('div');
    specWrap.id = 'cp-spec-wrap';
    specCanvas = document.createElement('canvas');
    specCanvas.id = 'cp-spec';
    cursor = document.createElement('div');
    cursor.id = 'cp-cursor';
    specWrap.appendChild(specCanvas);
    specWrap.appendChild(cursor);

    // Hue
    const hueWrap = document.createElement('div');
    hueWrap.id = 'cp-hue-wrap';
    hueCanvas = document.createElement('canvas');
    hueCanvas.id = 'cp-hue';
    hueCursor = document.createElement('div');
    hueCursor.id = 'cp-hue-cursor';
    hueWrap.appendChild(hueCanvas);
    hueWrap.appendChild(hueCursor);

    // Bottom row
    const bottom = document.createElement('div');
    bottom.id = 'cp-bottom';
    previewBox = document.createElement('div');
    previewBox.id = 'cp-preview';
    hexInput = document.createElement('input');
    hexInput.id = 'cp-hex';
    hexInput.type = 'text';
    hexInput.maxLength = 7;
    hexInput.spellcheck = false;
    bottom.appendChild(previewBox);
    bottom.appendChild(hexInput);

    // Buttons
    const btns = document.createElement('div');
    btns.id = 'cp-btns';
    const btnCancel  = document.createElement('button');
    btnCancel.id = 'cp-cancel'; btnCancel.className = 'cp-btn'; btnCancel.textContent = 'Cancelar';
    const btnConfirm = document.createElement('button');
    btnConfirm.id = 'cp-confirm'; btnConfirm.className = 'cp-btn'; btnConfirm.textContent = 'Aplicar';
    btns.appendChild(btnCancel); btns.appendChild(btnConfirm);

    popup.appendChild(specWrap);
    popup.appendChild(hueWrap);
    popup.appendChild(bottom);
    popup.appendChild(btns);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // ── Eventos espectro ──
    specWrap.addEventListener('mousedown',  onSpecDown);
    specWrap.addEventListener('touchstart', onSpecDown, { passive: false });
    document.addEventListener('mousemove',  onSpecMove);
    document.addEventListener('touchmove',  onSpecMove, { passive: false });

    // ── Eventos hue ──
    hueWrap.addEventListener('mousedown',  onHueDown);
    hueWrap.addEventListener('touchstart', onHueDown, { passive: false });
    document.addEventListener('mousemove',  onHueMove);
    document.addEventListener('touchmove',  onHueMove, { passive: false });

    // ── Stop drag ──
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchend',  onUp);

    // ── Hex input ──
    hexInput.addEventListener('input', () => {
      const v = hexInput.value.trim();
      const hex = v.startsWith('#') ? v : '#'+v;
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        const [r,g,b] = hexToRgb(hex);
        [currentH, currentS, currentV] = rgbToHsv(r,g,b);
        drawSpectrum(); updateCursors(); emit();
      }
    });

    // ── Botones ──
    btnCancel.addEventListener('click', () => {
      close(false);
    });
    btnConfirm.addEventListener('click', () => {
      close(true);
    });

    // ── Click fuera cierra ──
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close(false);
    });
  }

  // ── Redimensionar canvases según layout real ───────────────────────────────
  function resizeCanvases() {
    // Spectrum
    const sw = specCanvas.offsetWidth;
    const sh = specCanvas.offsetHeight;
    if (sw > 0 && sh > 0) {
      specCanvas.width  = sw * (window.devicePixelRatio || 1);
      specCanvas.height = sh * (window.devicePixelRatio || 1);
      specCtx = specCanvas.getContext('2d');
      specCtx.scale(window.devicePixelRatio||1, window.devicePixelRatio||1);
    }
    // Hue
    const hw = hueCanvas.offsetWidth;
    const hh = hueCanvas.offsetHeight;
    if (hw > 0 && hh > 0) {
      hueCanvas.width  = hw * (window.devicePixelRatio || 1);
      hueCanvas.height = hh * (window.devicePixelRatio || 1);
      hueCtx = hueCanvas.getContext('2d');
      hueCtx.scale(window.devicePixelRatio||1, window.devicePixelRatio||1);
    }
  }

  // ── API pública ────────────────────────────────────────────────────────────
  function open(hex, anchorEl, onChange, onClose) {
    build();
    onChangeCb = onChange || null;
    onCloseCb  = onClose  || null;

    // Parsear color inicial
    try {
      const [r,g,b] = hexToRgb(hex || '#ff0000');
      [currentH, currentS, currentV] = rgbToHsv(r, g, b);
    } catch(e) {
      currentH = 0; currentS = 1; currentV = 1;
    }

    overlay.classList.add('open');

    // Esperar un frame para que el DOM calcule dimensiones
    requestAnimationFrame(() => {
      resizeCanvases();
      drawSpectrum();
      drawHue();
      updateCursors();
    });
  }

  function close(confirm) {
    if (!overlay) return;
    overlay.classList.remove('open');
    if (confirm && onCloseCb) onCloseCb(currentHex());
    else if (!confirm && onCloseCb) onCloseCb(null); // null = cancelado
    onChangeCb = null;
    onCloseCb  = null;
  }

  return { open, close };

})();
