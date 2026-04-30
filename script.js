// =======================
// CONFIG API
// =======================
const API_URL = window.location.hostname === "127.0.0.1"
  ? "http://127.0.0.1:3000"
  : "https://aquaterraconsultora-api.onrender.com";

// =======================
// MENU
// =======================
function toggleMenu() {
  const menu = document.getElementById("menu");
  const arrow = document.getElementById("arrow");

  if (!menu) return;

  menu.classList.toggle("show");

  if (arrow) {
    arrow.classList.toggle("rotate");
  }
}

// =======================
// ESTADO GLOBAL
// =======================
let datosActuales = null;
let estacionActual = null;

// =======================
// INICIO GENERAL
// =======================
document.addEventListener("DOMContentLoaded", () => {

  const mapContainer = document.getElementById("map");

  // =========================
  // SI EXISTE MAPA → INICIALIZAR
  // =========================
  if (mapContainer) {

    const map = L.map('map', { zoomControl: false })
      .setView([-16.5, -64.5], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // =========================
    // ZOOM PERSONALIZADO
    // =========================
    const ZoomControl = L.Control.extend({
      options: { position: 'topright' },

      onAdd: function () {
        const container = L.DomUtil.create('div', 'custom-zoom-control');

        const zoomIn = L.DomUtil.create('button', 'zoom-btn', container);
        zoomIn.innerHTML = '+';

        const slider = L.DomUtil.create('input', 'zoom-slider', container);
        slider.type = 'range';
        slider.min = map.getMinZoom();
        slider.max = map.getMaxZoom();
        slider.value = map.getZoom();

        const zoomOut = L.DomUtil.create('button', 'zoom-btn', container);
        zoomOut.innerHTML = '−';

        L.DomEvent.disableClickPropagation(container);

        zoomIn.onclick = () => map.zoomIn();
        zoomOut.onclick = () => map.zoomOut();
        slider.oninput = (e) => map.setZoom(parseInt(e.target.value));

        map.on('zoomend', () => {
          slider.value = map.getZoom();
        });

        return container;
      }
    });

    map.addControl(new ZoomControl());

    // =========================
    // CAPAS
    // =========================
    const estacionesLayer = L.layerGroup().addTo(map);
    const riosLayer = L.layerGroup();
    const departamentosLayer = L.layerGroup();

    const capasControl = L.control.layers(null, {
      "Estaciones": estacionesLayer,
      "Ríos": riosLayer,
      "Departamentos": departamentosLayer
    }, { position: 'topright' }).addTo(map);

    const container = capasControl.getContainer();
    container.addEventListener('mouseenter', () => {
      container.classList.add('leaflet-control-layers-expanded');
    });
    container.addEventListener('mouseleave', () => {
      container.classList.remove('leaflet-control-layers-expanded');
    });

    // =========================
    // CARGAR ESTACIONES (MAPA + LISTA)
    // =========================
    cargarEstaciones(estacionesLayer);

    // =========================
    // GEOJSON
    // =========================
    fetch('json/Mapa_limites.geojson')
      .then(res => res.json())
      .then(data => {
        const geo = L.geoJSON(data, {
          style: { color: "#403f3f", weight: 0.8, fillOpacity: 0 }
        });
        geo.eachLayer(layer => departamentosLayer.addLayer(layer));
      })
      .catch(err => console.error("Error departamentos:", err));

    fetch('json/bol_rios1m.geojson')
      .then(res => res.json())
      .then(data => {
        const geo = L.geoJSON(data, {
          style: { color: "#00b4d8", weight: 1.5 }
        });
        geo.eachLayer(layer => riosLayer.addLayer(layer));
      })
      .catch(err => console.error("Error ríos:", err));

  } else {
    // =========================
    // SI NO HAY MAPA → SOLO LISTA
    // =========================
    cargarEstaciones(null);
  }
});

// =======================
// CARGAR ESTACIONES
// =======================
async function cargarEstaciones(estacionesLayer) {
  const res = await fetch('datos/Stations_coord_UTF_8.csv');
  const text = await res.text();

  const rows = text.split("\n").slice(1);
  const estaciones = [];

  rows.forEach(row => {
    const cols = row.split(",");

    const nombre = cols[2]?.trim();
    const departamento = cols[3]?.trim();
    const lat = parseFloat(cols[5]);
    const lon = parseFloat(cols[6]);

    if (!nombre || !departamento || isNaN(lat) || isNaN(lon)) return;

    estaciones.push({ nombre, departamento });

    if (estacionesLayer) {
      const marker = L.circleMarker([lat, lon], {
        radius: 4,
        color: "#000",
        fillColor: "#43648b",
        fillOpacity: 0.6
      });

      marker.bindPopup(`<strong>${nombre}</strong><br>${departamento}`);
      marker.addTo(estacionesLayer);
    }
  });

  renderizarEstaciones(estaciones);
}

// =======================
// AGRUPAR Y MOSTRAR
// =======================
function renderizarEstaciones(estaciones) {
  const contenedor = document.getElementById("lista-estaciones");
  if (!contenedor) return;

  contenedor.innerHTML = "";

  const grupos = {};

  estaciones.forEach(est => {
    if (!grupos[est.departamento]) {
      grupos[est.departamento] = [];
    }
    grupos[est.departamento].push(est);
  });

  Object.keys(grupos).forEach(depto => {
    const div = document.createElement("div");
    div.className = "departamento";

    const titulo = document.createElement("h3");
    titulo.textContent = depto;
    div.appendChild(titulo);

    grupos[depto].forEach(est => {
      const label = document.createElement("label");

      label.innerHTML = `
        <input type="checkbox" value="${est.nombre}">
        ${est.nombre}
      `;

      div.appendChild(label);
    });

    contenedor.appendChild(div);
  });
}

// =======================
// EVENTO CHECK
// =======================
document.addEventListener("change", (e) => {
  if (e.target.type === "checkbox") {
    actualizarAnalisis();
  }
});

// =======================
// ACTUALIZAR ANALISIS
// =======================
async function actualizarAnalisis() {
  const checks = document.querySelectorAll("#lista-estaciones input:checked");
  if (checks.length === 0) return;

  const estacion = checks[0].value;

  const loader = document.getElementById("loader");
  if (loader) loader.classList.remove("hidden");

  try {
    const res = await fetch(`${API_URL}/data/${encodeURIComponent(estacion)}`);
    const data = await res.json();

    datosActuales = data;
    estacionActual = estacion;

    graficar(data, estacion);
    calcularEstadisticos(data);
  } catch (err) {
    console.error(err);
  } finally {
    if (loader) loader.classList.add("hidden");
  }
}

// =======================
// UNIFICAR FECHAS
// =======================
function unificarFechas(data) {
  const keys = new Set([
    ...Object.keys(data.base),
    ...Object.keys(data.imerg),
    ...Object.keys(data.chirps)
  ]);

  const labels = Array.from(keys).sort();

  const rellenar = (d) => labels.map(k => d[k] || 0);

  return {
    labels,
    base: rellenar(data.base),
    imerg: rellenar(data.imerg),
    chirps: rellenar(data.chirps)
  };
}

// =======================
// GRAFICAR
// =======================
const legendTopRightPlugin = {
  id: 'legendTopRight',

  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    const legend = chart.legend;

    if (!legend) return;

    const padding = 10;

    const x = chartArea.right - legend.width - padding;
    const y = chartArea.top + padding;

    legend.top = y;
    legend.left = x;

    legend.draw(ctx);
  }
};

let chart;

function graficar(dataRaw, estacion) {
  const canvas = document.getElementById("grafico");
  if (!canvas) return;
  
  const titulo = document.getElementById("titulo-estacion");
  if (titulo) {
    titulo.textContent = `Estación: ${estacion}`;
  }
  
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const data = unificarFechas(dataRaw);

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        { label: "SENAMHI", data: data.base },
        { label: "IMERG", data: data.imerg },
        { label: "CHIRPS", data: data.chirps }
      ]
    },
    plugins: [legendTopRightPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      
      
    legend: {
      display: true,
      position: 'top'
    }
  },
      
      scales: {
    x: {
      title: {
        display: true,
        text: "Años"
      },
      ticks: {
        autoSkip: true,
        maxTicksLimit: 10,
        callback: function(value, index, ticks){
          const label = this.getLabelForValue(value);
          return label.split("-")[0];
      }
    }
  },

    y: {
      title: {
        display: true,
        text: "Precipitación mensual [mm]"
      }
    }
  }
      
    }
  });
}

// =======================
// NASH
// =======================
function nash(obs, sim) {
  const mean = obs.reduce((a,b)=>a+b,0) / obs.length;

  let num = 0, den = 0;

  for (let i = 0; i < obs.length; i++) {
    num += (obs[i] - sim[i]) ** 2;
    den += (obs[i] - mean) ** 2;
  }

  return 1 - num/den;
}

// =======================
// ESTADISTICOS
// =======================
function calcularEstadisticos(dataRaw) {
  const el = document.getElementById("estadisticos");
  if (!el) return;

  const data = unificarFechas(dataRaw);

  const nashI = nash(data.base, data.imerg);
  const nashC = nash(data.base, data.chirps);

  el.innerHTML = `
    <p><strong>Nash IMERG:</strong> ${nashI.toFixed(3)}</p>
    <p><strong>Nash CHIRPS:</strong> ${nashC.toFixed(3)}</p>
  `;
}

// =======================
// DESCARGA DATOS
// =======================

function descargarDatos(tipo) {
  if (!datosActuales) {
    alert("Primero selecciona una estación");
    return;
  }

  const data = unificarFechas(datosActuales);

  let contenido = "fecha";

  if (tipo === "base" || tipo === "all") contenido += ",SENAMHI";
  if (tipo === "imerg" || tipo === "all") contenido += ",IMERG";
  if (tipo === "chirps" || tipo === "all") contenido += ",CHIRPS";

  contenido += "\n";

  for (let i = 0; i < data.labels.length; i++) {
    let fila = data.labels[i];

    if (tipo === "base" || tipo === "all") fila += `,${data.base[i]}`;
    if (tipo === "imerg" || tipo === "all") fila += `,${data.imerg[i]}`;
    if (tipo === "chirps" || tipo === "all") fila += `,${data.chirps[i]}`;

    contenido += fila + "\n";
  }

  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `datos_${estacionActual}_${tipo}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}
