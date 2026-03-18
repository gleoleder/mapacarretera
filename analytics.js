// ─────────────────────────────────────────────────────────────────────────────
//  analytics.js — Contador de visitas y corazones (❤️ likes)
//
//  Sin API Keys. Sin OAuth. Sin claves expuestas.
//  Todo va por el Apps Script Web App que tú controlas.
//
//  Cómo funciona:
//  - Al cargar: GET al script → obtiene visitas totales y likes totales
//  - Al cargar: POST action:"visita" → incrementa contador de visitas
//  - Al dar ❤️: POST action:"like"   → incrementa contador de likes
//  - Los contadores se muestran en un widget flotante en la esquina
//  - Un like por dispositivo (guardado en localStorage)
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const URL  = (typeof CONFIG !== 'undefined') ? CONFIG.APPS_SCRIPT_URL : '';
  const LIKE_KEY = 'cdc_liked'; // localStorage key

  // ── Estado local ──────────────────────────────────────────────────────────
  let visitas = '…';
  let likes   = '…';
  let yaLikeo = localStorage.getItem(LIKE_KEY) === '1';

  // ── Crear widget ──────────────────────────────────────────────────────────
  function crearWidget() {
    const w = document.createElement('div');
    w.id = 'cdc-widget';
    w.innerHTML = `
      <div class="cdc-stat" id="cdc-visits" title="Visitas totales">
        <span class="cdc-icon">👁</span>
        <span class="cdc-num" id="cdc-v-num">…</span>
      </div>
      <button class="cdc-stat cdc-like-btn" id="cdc-like-btn"
        title="Me gusta" onclick="window.__cdcLike()">
        <span class="cdc-icon" id="cdc-heart">${yaLikeo ? '❤️' : '🤍'}</span>
        <span class="cdc-num" id="cdc-l-num">…</span>
      </button>
    `;
    document.body.appendChild(w);
    // Inyectar estilos
    const s = document.createElement('style');
    s.textContent = `
      #cdc-widget {
        position: fixed;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);
        left: calc(env(safe-area-inset-left, 0px) + 18px);
        z-index: 50;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
      }
      .cdc-stat {
        display: flex;
        align-items: center;
        gap: 7px;
        background: rgba(8,8,13,0.82);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 20px;
        padding: 6px 13px 6px 10px;
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        pointer-events: auto;
        font-family: 'DM Mono', monospace, sans-serif;
        font-size: 12px;
        color: rgba(238,237,230,0.65);
        white-space: nowrap;
        transition: border-color 0.2s, transform 0.15s;
        cursor: default;
        user-select: none;
      }
      .cdc-like-btn {
        background: rgba(8,8,13,0.82);
        border: none;
        outline: none;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .cdc-like-btn:hover {
        border-color: rgba(232,100,100,0.45);
        transform: scale(1.06);
      }
      .cdc-like-btn:active { transform: scale(0.95); }
      .cdc-like-btn.liked {
        border-color: rgba(232,100,100,0.55);
        color: rgba(238,180,180,0.9);
      }
      .cdc-icon { font-size: 14px; line-height: 1; }
      .cdc-num  { font-size: 12px; min-width: 20px; }

      /* Animación pop al dar like */
      @keyframes cdcPop {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.35); }
        70%  { transform: scale(0.88); }
        100% { transform: scale(1); }
      }
      .cdc-pop { animation: cdcPop 0.38s ease both; }

      @media (max-width: 520px) {
        #cdc-widget { bottom: calc(env(safe-area-inset-bottom,0px) + 14px); left: calc(env(safe-area-inset-left,0px) + 14px); }
        .cdc-stat { padding: 5px 10px 5px 9px; font-size: 11px; }
        .cdc-icon { font-size: 13px; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Actualizar números en pantalla ────────────────────────────────────────
  function actualizarUI() {
    const vEl = document.getElementById('cdc-v-num');
    const lEl = document.getElementById('cdc-l-num');
    if (vEl) vEl.textContent = formatNum(visitas);
    if (lEl) lEl.textContent = formatNum(likes);
    const btn = document.getElementById('cdc-like-btn');
    if (btn) btn.classList.toggle('liked', yaLikeo);
  }

  function formatNum(n) {
    if (n === '…') return '…';
    n = Number(n);
    if (isNaN(n)) return '0';
    if (n >= 1000000) return (n/1000000).toFixed(1).replace('.0','') + 'M';
    if (n >= 1000)    return (n/1000).toFixed(1).replace('.0','') + 'K';
    return String(n);
  }

  // ── Llamar al Apps Script ─────────────────────────────────────────────────
  async function llamar(action, extra) {
    if (!URL) return null;
    try {
      const resp = await fetch(URL, {
        method : 'POST',
        mode   : 'no-cors',   // Apps Script acepta no-cors
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action, ...extra }),
      });
      // no-cors → no podemos leer la respuesta; para GET usamos JSONP trick
      return true;
    } catch (e) {
      return null;
    }
  }

  // Para leer contadores usamos GET con callback JSONP
  function obtenerContadores() {
    if (!URL) return;
    const cbName = '__cdcCb_' + Date.now();
    window[cbName] = function(data) {
      if (data && typeof data.visitas !== 'undefined') visitas = data.visitas;
      if (data && typeof data.likes   !== 'undefined') likes   = data.likes;
      actualizarUI();
      delete window[cbName];
      document.getElementById('_cdcScript') && document.getElementById('_cdcScript').remove();
    };
    const s   = document.createElement('script');
    s.id      = '_cdcScript';
    s.src     = URL + '?action=get&cb=' + cbName;
    s.onerror = () => { delete window[cbName]; };
    document.head.appendChild(s);
  }

  // ── Acción: dar like ──────────────────────────────────────────────────────
  window.__cdcLike = function () {
    if (yaLikeo) return; // solo un like por dispositivo
    yaLikeo = true;
    localStorage.setItem(LIKE_KEY, '1');
    // Animación inmediata
    const heart = document.getElementById('cdc-heart');
    const btn   = document.getElementById('cdc-like-btn');
    if (heart) { heart.textContent = '❤️'; heart.classList.add('cdc-pop'); }
    if (btn)   { btn.classList.add('liked'); }
    likes = (likes === '…' ? 1 : Number(likes) + 1);
    actualizarUI();
    // Enviar al servidor
    llamar('like');
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    crearWidget();
    actualizarUI();
    // Registrar visita + obtener contadores
    llamar('visita');
    obtenerContadores();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 80);
  }

})();
