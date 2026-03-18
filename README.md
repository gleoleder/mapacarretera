# 🗺️ Calles de la Ciudad
**Generador de mapas artísticos vectoriales** — por Leonardo Cabrera

---

## 📁 Archivos

```
city-roads/
├── index.html      ← Aplicación principal
├── vendor.js       ← Librerías (w-gl + d3-geo)
├── config.js       ← Solo la URL de tu Apps Script ← EDITAR
├── analytics.js    ← Widget de visitas y corazones ❤️
└── README.md       ← Este archivo
```

---

## 🚀 Despliegue

Sube los **4 archivos** a cualquier hosting estático:

| Plataforma | Pasos |
|---|---|
| **GitHub Pages** | Repo → Settings → Pages → Deploy from branch |
| **Netlify** | Arrastra la carpeta a [netlify.com/drop](https://app.netlify.com/drop) |
| **Vercel** | `npx vercel` en la carpeta |
| **Local** | `npx serve .` (necesario para que el widget funcione) |

---

## ❤️ Configurar el contador de visitas y corazones

El widget muestra en la esquina inferior izquierda:
- 👁 Visitas totales — se incrementa automáticamente con cada carga
- 🤍 / ❤️ Likes — el usuario lo da una vez (guardado en su dispositivo)

**Sin API Keys. Sin OAuth. Sin ninguna clave expuesta.**
Solo necesitas desplegar un Apps Script desde tu propio Google Sheet.

---

### Paso 1 — Preparar el Google Sheet

1. Abre tu Sheet: `https://docs.google.com/spreadsheets/d/18CgbMS4y3QkP4af8bk7t4Xk8dn40-NB8Xj1bLnRTVik`
2. La hoja solo necesita **dos celdas** en la primera hoja (o créa una hoja llamada `Contadores`):

```
A1: visitas    B1: 0
A2: likes      B2: 0
```

---

### Paso 2 — Crear el Apps Script

1. En el Sheet: **Extensiones → Apps Script**
2. Borra todo y pega este código:

```javascript
var SHEET_NAME = 'Contadores'; // nombre de tu hoja

function doGet(e) {
  var cb    = e.parameter.cb;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var data  = {
    visitas: Number(sheet.getRange('B1').getValue()),
    likes:   Number(sheet.getRange('B2').getValue()),
  };
  // JSONP para que el widget pueda leer los datos sin CORS
  var json = JSON.stringify(data);
  return ContentService
    .createTextOutput(cb + '(' + json + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  var body   = JSON.parse(e.postData.contents);
  var sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var action = body.action;

  if (action === 'visita') {
    var v = Number(sheet.getRange('B1').getValue()) + 1;
    sheet.getRange('B1').setValue(v);
  } else if (action === 'like') {
    var l = Number(sheet.getRange('B2').getValue()) + 1;
    sheet.getRange('B2').setValue(l);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Clic en **Guardar** (ícono de disco o Ctrl+S)

---

### Paso 3 — Desplegar como Web App

1. Clic en **Implementar → Nueva implementación**
2. Clic en el ícono ⚙️ → selecciona **Aplicación web**
3. Configura:
   - **Descripción:** Contador calles ciudad
   - **Ejecutar como:** Yo (tu cuenta de Google)
   - **Quién tiene acceso:** Cualquiera
4. Clic en **Implementar**
5. Autoriza los permisos cuando te lo pida (solo la primera vez)
6. **Copia la URL** que termina en `/exec` — se ve así:
   ```
   https://script.google.com/macros/s/AKfycbXXXXXXXXXXXXXX/exec
   ```

---

### Paso 4 — Pegar la URL en config.js

Abre `config.js` y reemplaza:

```javascript
APPS_SCRIPT_URL: '',
```

Por:

```javascript
APPS_SCRIPT_URL: 'https://script.google.com/macros/s/TU_ID_AQUI/exec',
```

Guarda, sube los archivos, y listo. El widget aparece automáticamente en la esquina inferior izquierda.

---

### ¿Qué ve el usuario?

```
👁 1.2K      ← visitas totales (formateado)
🤍 347       ← likes totales
```

Al hacer clic en el corazón:
- Se convierte en ❤️ con una animación pop
- Se incrementa el contador en pantalla de inmediato
- Se envía la señal al Sheet en segundo plano
- No puede volver a dar like en el mismo dispositivo (localStorage)

---

## 🎨 Personalización rápida

**Grosor de las líneas del mapa** — en `index.html`, busca `const TEMAS`:

```javascript
const TEMAS = {
  dark: { ..., lineWidth: 0.6 },  // 0.5 muy fino, 1.0 normal
  blue: { ..., lineWidth: 0.6 },
};
```

**Colores del widget** — en `analytics.js`, busca `.cdc-stat` en los estilos y cambia `background`, `border` etc.

---

## 📱 Compatibilidad

| Dispositivo | Soporte |
|---|---|
| Desktop Chrome / Edge / Firefox / Safari | ✅ |
| iPhone / iPad Safari | ✅ Color picker nativo |
| Android Chrome / Firefox | ✅ |
| HiDPI / Retina | ✅ Canvas × devicePixelRatio |
| Ultra-wide / multipantalla | ✅ |
| Modo landscape móvil | ✅ |
| Notch / Dynamic Island | ✅ safe-area-inset |

---

## 📤 Exportación

| Formato | Detalle |
|---|---|
| **PNG** | Resolución nativa, incluye etiqueta de ciudad |
| **SVG** | Vector puro listo para Illustrator / impresión |

---

*Calles de la Ciudad · Leonardo Cabrera · Datos © OpenStreetMap contributors, ODbL 1.0*
