const API_URL = window.location.hostname === "127.0.0.1"
  ? "http://127.0.0.1:3000"
  : "https://aquaterraconsultora-api.onrender.com";

function toggleMenu() {
  const menu = document.getElementById("menu");
  const arrow = document.getElementById("arrow");

  menu.classList.toggle("show");

  if (arrow) {
    arrow.classList.toggle("rotate");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // =========================
  // MAPA
  // =========================
  const map = L.map('map', {
    zoomControl: false
  }).setView([-16.5, -64.5], 5);

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
  // CAPAS BASE
  // =========================
  const estacionesLayer = L.layerGroup().addTo(map);
  const riosLayer = L.layerGroup();

  // ⚡ capa vacía para departamentos (clave)
  const departamentosLayer = L.layerGroup();

  // =========================
  // CONTROL DE CAPAS (SIEMPRE EXISTE)
  // =========================
  const capasControl = L.control.layers(null, {
    "Estaciones": estacionesLayer,
    "Ríos": riosLayer,
    "Departamentos": departamentosLayer
  }, {
    position: 'topright',
    collapsed: true
  }).addTo(map);

  // Hover automático
  const container = capasControl.getContainer();
  container.addEventListener('mouseenter', () => {
    container.classList.add('leaflet-control-layers-expanded');
  });
  container.addEventListener('mouseleave', () => {
    container.classList.remove('leaflet-control-layers-expanded');
  });

  // =========================
  // CSV ESTACIONES
  // =========================
  fetch('datos/Stations_coord_UTF_8.csv')
  .then(res => res.text())
  .then(data => {

    const rows = data.split("\n").slice(1);

    rows.forEach(row => {
      const cols = row.split(",");

      if (cols.length < 8) return;

      const codigo = cols[1]?.trim();
      const nombre = cols[2]?.trim();
      const departamento = cols[3]?.trim();
      const provincia = cols[4]?.trim();
      const lat = parseFloat(cols[5]);
      const lon = parseFloat(cols[6]);
      const alt = cols[7]?.trim();

      if (!nombre || isNaN(lat) || isNaN(lon)) return;

      const marker = L.circleMarker([lat, lon], {
        radius: 4,
        color: "#000000",
        fillColor: "#43648b",
        fillOpacity: 0.6,
        weight: 1
      });

      marker.bindPopup(`
        Estación: <strong>${nombre}</strong><br>
        Código: ${codigo}<br>
        ${departamento} - ${provincia}<br>
        Latitud: ${lat}<br>
        Longitud: ${lon}<br>
        Altitud: ${alt} m
      `);

      marker.addTo(estacionesLayer);

    });

  });

  // =========================
  // GEOJSON DEPARTAMENTOS
  // =========================
  fetch('json/Mapa_limites.geojson')
  .then(res => {
    if (!res || !res.ok) {
      throw new Error(`Error HTTP: ${res?.status}`);
    }
    return res.json();
  })
  .then(data => {

      const geo = L.geoJSON(data, {
        style: {
          color: "#403f3f",
          weight: 0.8,
          fillOpacity: 0
        },
        interactive: false
      });

      geo.eachLayer(layer => {
        departamentosLayer.addLayer(layer);
      });
    })
    .catch(err => console.error("GeoJSON error:", err));

    // =========================
// GEOJSON RÍOS
// =========================
fetch('json/bol_rios1m.geojson')
  .then(res => {
    if (!res.ok) throw new Error("Error cargando ríos");
    return res.json();
  })
  .then(data => {

    const riosGeo = L.geoJSON(data, {
      style: {
        color: "#00b4d8",
        weight: 1.5,
        opacity: 0.8
      }
    });

    riosGeo.eachLayer(layer => {
      riosLayer.addLayer(layer);
    });

  })
  .catch(err => console.error("Error ríos:", err));

});

// =======================
// INICIO
// =======================
document.addEventListener("DOMContentLoaded", () => {
  cargarListaEstaciones();
});

// =======================
// LISTA DE ESTACIONES
// =======================
async function cargarListaEstaciones() {
  const res = await fetch('datos/Stations_coord_UTF_8.csv');
  const text = await res.text();

  const rows = text.split("\n").slice(1);
  const container = document.getElementById("lista-estaciones");

  rows.forEach(row => {
    const cols = row.split(",");

    const nombre = cols[2]?.trim();
    if (!nombre) return;

    const div = document.createElement("div");

    div.innerHTML = `
      <label>
        <input type="checkbox" value="${nombre}">
        ${nombre}
      </label>
    `;

    container.appendChild(div);
  });
}

// =======================
// EVENTO SELECCIÓN
// =======================
document.addEventListener("change", (e) => {
  if (e.target.type === "checkbox") {
    actualizarAnalisis();
  }
});

// =======================
// CARGAR DATOS
// =======================
async function actualizarAnalisis() {
  const checks = document.querySelectorAll("#lista-estaciones input:checked");

  if (checks.length === 0) return;

  const estacion = checks[0].value;

  const res = await fetch(`${API_URL}/data/${encodeURIComponent(estacion)}`);
  const data = await res.json();

  graficar(data);
  calcularEstadisticos(data);
}

// =======================
// UNIFICAR FECHAS
// =======================
function unificarFechas(data) {
  const allKeys = new Set([
    ...Object.keys(data.base),
    ...Object.keys(data.imerg),
    ...Object.keys(data.chirps)
  ]);

  const labels = Array.from(allKeys).sort();

  function rellenar(dataset) {
    return labels.map(k => dataset[k] || 0);
  }

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
let chart;

function graficar(dataRaw) {
  const data = unificarFechas(dataRaw);

  if (chart) chart.destroy();

  chart = new Chart(document.getElementById("grafica"), {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "SENAMHI",
          data: data.base
        },
        {
          label: "IMERG",
          data: data.imerg
        },
        {
          label: "CHIRPS",
          data: data.chirps
        }
      ]
    },
    options: {
      responsive: true
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
// ESTADÍSTICOS
// =======================
function calcularEstadisticos(dataRaw) {
  const data = unificarFechas(dataRaw);

  const nashImerg = nash(data.base, data.imerg);
  const nashChirps = nash(data.base, data.chirps);

  document.getElementById("estadisticos").innerHTML = `
    <p>Nash IMERG: ${nashImerg.toFixed(3)}</p>
    <p>Nash CHIRPS: ${nashChirps.toFixed(3)}</p>
  `;
}

function renderizarEstaciones(estaciones) {
  const contenedor = document.getElementById("lista-estaciones");
  contenedor.innerHTML = "";

  // Agrupar por departamento
  const grupos = {};

  estaciones.forEach(est => {
    if (!grupos[est.departamento]) {
      grupos[est.departamento] = [];
    }
    grupos[est.departamento].push(est);
  });

  // Crear HTML
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
