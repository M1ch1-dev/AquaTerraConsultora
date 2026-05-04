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
  if (arrow) arrow.classList.toggle("rotate");
}
// =======================
// ANIMACION CARGANDO
// =======================
let intervaloLoader = null;
let puntos = 1;
function iniciarLoader() {
  const texto = document.getElementById("texto-loader");
  if (!texto) return;

  puntos = 1;

  intervaloLoader = setInterval(() => {
    puntos++;
    if (puntos > 4) puntos = 1;

    texto.textContent = "Cargando datos" + ".".repeat(puntos);
  }, 400);
}

function detenerLoader() {
  clearInterval(intervaloLoader);
}
// =======================
// ESTADO GLOBAL
// =======================
let datosActuales = null;
let estacionActual = null;
let modoGrafico = "mensual"; // "mensual" | "max"
let map;
let estacionesSeleccionadas = [];
let datasetSeleccionado = "base";

const ZoomControl = L.Control.extend({
  options: { position: 'topright' },

  onAdd: function (map) {   
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


// =======================
// INICIO
// =======================
document.addEventListener("DOMContentLoaded", () => {

  const selectModo = document.getElementById("select-modo");

  if (selectModo) {
    selectModo.addEventListener("change", () => {
      modoGrafico = selectModo.value;
  
      if (datosActuales) {
        graficar(datosActuales);
        calcularEstadisticos(datosActuales);
      }
    });
  }
  
  const mapContainer = document.getElementById("map");

  if (mapContainer) {

  map = L.map('map', { zoomControl: false })
  .setView([-16.5, -64.5], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap'
}).addTo(map);
    
map.addControl(new ZoomControl());    

// =========================
// CAPAS
// =========================
const estacionesLayer = L.layerGroup().addTo(map);
const riosLayer = L.layerGroup();
const departamentosLayer = L.layerGroup();

// Control de capas (botón)
const capasControl = L.control.layers(null, {
  "Estaciones": estacionesLayer,
  "Ríos": riosLayer,
  "Departamentos": departamentosLayer
}, { position: 'topright' }).addTo(map);

// Hover automático (como tenías antes)
const container = capasControl.getContainer();
container.addEventListener('mouseenter', () => {
  container.classList.add('leaflet-control-layers-expanded');
});
container.addEventListener('mouseleave', () => {
  container.classList.remove('leaflet-control-layers-expanded');
});
// =========================
// CARGAR ESTACIONES
// =========================
cargarEstaciones(estacionesLayer);
// =========================
// GEOJSON - DEPARTAMENTOS
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
// =========================
// GEOJSON - RÍOS
// =========================
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
// LISTA
// =======================
function renderizarEstaciones(estaciones) {

  const selectDepto = document.getElementById("select-depto");
  const selectEst = document.getElementById("select-estacion");

  //  NUEVOS (multi)
  const multiDepto = document.getElementById("multi-depto");
  const multiEst = document.getElementById("multi-estacion");

  if (!selectDepto || !selectEst) return;

  const grupos = {};

  estaciones.forEach(est => {
    if (!grupos[est.departamento]) {
      grupos[est.departamento] = [];
    }
    grupos[est.departamento].push(est.nombre);
  });
  // =========================
  // LLENAR DEPARTAMENTOS
  // =========================
  const deptos = Object.keys(grupos).sort();

  // --- PANEL ORIGINAL
  selectDepto.innerHTML = `<option value="">-- Seleccione --</option>`;

  deptos.forEach(depto => {
    const opt = document.createElement("option");
    opt.value = depto;
    opt.textContent = depto;
    selectDepto.appendChild(opt);
  });

  // --- PANEL MULTI 
  if (multiDepto) {
    multiDepto.innerHTML = `<option value="">-- Seleccione --</option>`;

    deptos.forEach(depto => {
      const opt = document.createElement("option");
      opt.value = depto;
      opt.textContent = depto;
      multiDepto.appendChild(opt);
    });
  }
  // =========================
  // EVENTO PANEL ORIGINAL
  // =========================
  selectDepto.addEventListener("change", () => {

    const depto = selectDepto.value;

    selectEst.innerHTML = "";

    if (!depto) {
      selectEst.disabled = true;
      selectEst.innerHTML = `<option>-- Seleccione un departamento primero --</option>`;
      return;
    }

    selectEst.disabled = false;

    const estacionesDepto = grupos[depto];

    selectEst.innerHTML = `<option value="">-- Seleccione --</option>`;

    estacionesDepto.sort().forEach(nombre => {
      const opt = document.createElement("option");
      opt.value = nombre;
      opt.textContent = nombre;
      selectEst.appendChild(opt);
    });

  });
  // =========================
  // EVENTO PANEL MULTI 
  // =========================
  if (multiDepto && multiEst) {

    multiDepto.addEventListener("change", () => {

      const depto = multiDepto.value;

      multiEst.innerHTML = "";

      if (!depto) {
        multiEst.disabled = true;
        multiEst.innerHTML = `<option>-- Seleccione un departamento primero --</option>`;
        return;
      }
      multiEst.disabled = false;

      const estacionesDepto = grupos[depto];

      multiEst.innerHTML = `<option value="">-- Seleccione --</option>`;

      estacionesDepto.sort().forEach(nombre => {
        const opt = document.createElement("option");
        opt.value = nombre;
        opt.textContent = nombre;
        multiEst.appendChild(opt);
      });

    });

  }
  // =========================
  // SELECCIÓN MULTI 
  // =========================
  if (multiEst) {
    multiEst.addEventListener("change", (e) => {
      const estacion = e.target.value;
      if (!estacion) return;

      if (!estacionesSeleccionadas.includes(estacion)) {
        estacionesSeleccionadas.push(estacion);
        renderSeleccionadas();
        actualizarGraficoMulti();
      }
    });
  }
  // =========================
  // PANEL ORIGINAL (igual)
  // =========================
  selectEst.addEventListener("change", () => {
    const estacion = selectEst.value;
    if (!estacion) return;

    actualizarAnalisis(estacion);
  });
}

// =======================
// ACTUALIZAR
// =======================
async function actualizarAnalisis(estacion) {

  if (!estacion) return;

  const loader = document.getElementById("loader");

  if (loader) {
    loader.classList.remove("hidden");
    iniciarLoader();
  }

  try {
    const res = await fetch(`${API_URL}/data/${encodeURIComponent(estacion)}`);
    const data = await res.json();

    datosActuales = data;
    estacionActual = estacion;

    graficar(data);
    calcularEstadisticos(data);

  } catch (err) {
    console.error(err);
  } finally {
    if (loader) {
      loader.classList.add("hidden");
      detenerLoader();
    }
  }
}

// =======================
// UNIFICAR
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

function agruparMensualFrontend(dataDiario) {
  const agrupar = (serie) => {
    const out = {};

    Object.entries(serie).forEach(([fecha, valor]) => {
      if (valor === null || isNaN(valor)) return;

      const [y, m] = fecha.split("-");
      const key = `${y}-${m}`;

      out[key] = (out[key] || 0) + valor;
    });

    return out;
  };

  return {
    base: agrupar(dataDiario.base),
    imerg: agrupar(dataDiario.imerg),
    chirps: agrupar(dataDiario.chirps)
  };
}

function agruparMaximoMensual(dataDiario) {
  const agrupar = (serie) => {
    const out = {};

    Object.entries(serie).forEach(([fecha, valor]) => {
      if (valor === null || isNaN(valor)) return;

      const [y, m] = fecha.split("-");
      const key = `${y}-${m}`;

      if (!(key in out)) {
        out[key] = valor;
      } else {
        out[key] = Math.max(out[key], valor);
      }
    });

    return out;
  };

  return {
    base: agrupar(dataDiario.base),
    imerg: agrupar(dataDiario.imerg),
    chirps: agrupar(dataDiario.chirps)
  };
}

// =======================
// PLUGIN LEYENDA
// =======================
const legendTopRightPlugin = {
  id: 'legendTopRight',

  afterDraw(chart) {
    const { ctx, chartArea } = chart;
    const datasets = chart.data.datasets;

    if (!chartArea) return;

    const labels = datasets.map(d => d.label);
    const colors = datasets.map(d => d.borderColor);

    const padding = 8;
    const lineHeight = 14;

    const width = 120;
    const height = labels.length * lineHeight + padding * 2;

    const x = chartArea.right - width - 10;
    const y = chartArea.top + 10;

    ctx.save();

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.strokeStyle = "#000";

    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);

    labels.forEach((label, i) => {
      const yPos = y + padding + i * lineHeight + 8;

      ctx.fillStyle = colors[i];
      ctx.fillRect(x + 8, yPos - 6, 10, 10);

      ctx.fillStyle = "#000";
      ctx.font = "11px Arial";
      ctx.fillText(label, x + 25, yPos);
    });

    ctx.restore();
  }
};

// =======================
// BORDE AREA
// =======================
const chartAreaBorder = {
  id: 'chartAreaBorder',
  afterDraw(chart) {
    const { ctx, chartArea } = chart;

    ctx.save();
    ctx.strokeStyle = "#000";
    ctx.strokeRect(
      chartArea.left,
      chartArea.top,
      chartArea.right - chartArea.left,
      chartArea.bottom - chartArea.top
    );
    ctx.restore();
  }
};

// =======================
// GRAFICAR
// =======================
let chart;

function graficar(dataRaw) {
  const canvas = document.getElementById("grafico");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  
  let dataProcesada;
  if (modoGrafico === "mensual") {
    dataProcesada = agruparMensualFrontend(dataRaw);
  } else {
    dataProcesada = agruparMaximoMensual(dataRaw);
  }
  
  const data = unificarFechas(dataProcesada);

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "SENAMHI",
          data: data.base,
          borderColor: "#1f77b4",
          backgroundColor: "#1f77b4",
          pointBackgroundColor: "#1f77b4",
          pointBorderColor: "#1f77b4",
          pointBorderWidth: 0,
          pointRadius: 2,
          pointHoverRadius: 3,
          borderWidth: 1.5,
          tension: 0.2
        },
        {
          label: "IMERG",
          data: data.imerg,
          borderColor: "#d62728",
          backgroundColor: "#d62728",
          pointBackgroundColor: "#d62728",
          pointBorderColor: "#d62728",
          pointBorderWidth: 0,
          pointRadius: 2,
          pointHoverRadius: 3,
          borderWidth: 1.5,
          tension: 0.2
        },
        {
          label: "CHIRPS",
          data: data.chirps,
          borderColor: "#2ca02c",
          backgroundColor: "#2ca02c",
          pointBackgroundColor: "#2ca02c",
          pointBorderColor: "#2ca02c",
          pointBorderWidth: 0,
          pointRadius: 2,
          pointHoverRadius: 3,
          borderWidth: 1.5,
          tension: 0.2
        }
      ]
    },
    plugins: [legendTopRightPlugin, chartAreaBorder],
    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        title: {
          display: true,
          text: modoGrafico === "mensual"
            ? `Serie de precipitación mensual estación: ${estacionActual}`
            : `Análisis de máximos diarios mensuales - Estación: ${estacionActual}`,
          font: { size: 16, weight: 'bold' }
        },
        legend: { display: false }
      },

      scales: {
        x: {
          title: {
            display: true,
            text: "Años",
            font: {
              size: 12,
              weight: 'bold' 
            }
          },
          ticks: {
            autoSkip: false,
            maxRotation: 0,   
            minRotation: 0,
            callback: function(value, index) {
              const label = this.getLabelForValue(value);
              const [year, month] = label.split("-");
              
              if (month === "01" && parseInt(year) % 2 === 0) {
              return year;
              }
              
               return "";
            }
          },
          grid: {
            display: true,
            borderDash: [6, 4],
            color: "rgba(0,0,0,0.2)",
            // solo en enero cada 2 años
            lineWidth: function(ctx) {
              const label = ctx.chart.data.labels[ctx.index];
              const [year, month] = label.split("-");
      
              return (month === "01" && parseInt(year) % 2 === 0) ? 1.5 : 0;
            }
          }
        },
        y: {
          title: {
            display: true,
            text: "Precipitación mensual [mm]",
            font: {
              size: 12,
              weight: 'bold'
            }
          },
          beginAtZero: true,   
          ticks: {
            stepSize: 100
          },
          suggestedMax: function(context) {
              const datasets = context.chart.data.datasets;
          
              let max = 0;
          
              datasets.forEach(ds => {
                const localMax = Math.max(...ds.data);
                if (localMax > max) max = localMax;
              });
          
              return max + 100; 
            },
          grid: {
            display: true,
            borderDash: [6, 4],
            color: "rgba(0,0,0,0.2)"
          }
        }
      }
    }
  });
}
// =======================
// MÉTRICAS
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

function rmse(obs, sim) {
  let sum = 0;
  for (let i = 0; i < obs.length; i++) {
    sum += (obs[i] - sim[i]) ** 2;
  }
  return Math.sqrt(sum / obs.length);
}

function r2(obs, sim) {
  const meanObs = obs.reduce((a,b)=>a+b,0) / obs.length;

  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < obs.length; i++) {
    ssTot += (obs[i] - meanObs) ** 2;
    ssRes += (obs[i] - sim[i]) ** 2;
  }

  return 1 - (ssRes / ssTot);
}

function porcentajeDatos(serie) {
  const total = serie.length;

  const validos = serie.filter(v =>
    v !== null && v !== undefined && !isNaN(v)
  ).length;

  return (validos / total) * 100;
}

function obtenerRangoFechasReales(dataBase) {
  const fechas = Object.keys(dataBase)
    .filter(f => dataBase[f] !== null && !isNaN(dataBase[f]))
    .sort();

  if (fechas.length === 0) {
    return { inicio: "-", fin: "-" };
  }

  return {
    inicio: fechas[0],
    fin: fechas[fechas.length - 1]
  };
}
function formatearFecha(fecha, modo) {
  if (!fecha) return "-";

  const [y, m, d] = fecha.split("-");

  if (modo === "mensual") {
    return `${m}/${y}`;
  } else {
    return `${d}/${m}/${y}`;
  }
}

// =======================
// ESTADISTICOS
// =======================
function calcularEstadisticos(dataRaw) {
  const el = document.getElementById("estadisticos");
  if (!el) return;

  let dataProcesada;

  if (modoGrafico === "mensual") {
    dataProcesada = agruparMensualFrontend(dataRaw);
  } else {
    dataProcesada = agruparMaximoMensual(dataRaw);
  }

  const data = unificarFechas(dataProcesada);

  const { inicio, fin } = obtenerRangoFechasReales(dataRaw.base);

  const nashI = nash(data.base, data.imerg);
  const nashC = nash(data.base, data.chirps);

  const rmseI = rmse(data.base, data.imerg);
  const rmseC = rmse(data.base, data.chirps);

  const r2I = r2(data.base, data.imerg);
  const r2C = r2(data.base, data.chirps);

  const tituloPorcentaje = modoGrafico === "mensual"
  ? "Porcentaje de meses con datos:"
  : "Porcentaje de días con datos:";

  let pBase;

  if (modoGrafico === "mensual") {
    const mensual = agruparMensualFrontend(dataRaw).base;
    pBase = porcentajeDatos(Object.values(mensual));
  } else {
    pBase = porcentajeDatos(Object.values(dataRaw.base));
  }

  el.innerHTML = `
  <div class="stats-container">

    <div class="stats-left">
      <h3>Métricas:</h3>

      <p><strong>Nash IMERG:</strong> ${nashI.toFixed(3)} |
         <strong>R² IMERG:</strong> ${r2I.toFixed(3)} | 
         <strong>RMSE IMERG:</strong> ${rmseI.toFixed(2)}</p>

      <p><strong>Nash CHIRPS:</strong> ${nashC.toFixed(3)} |
         <strong>R² CHIRPS:</strong> ${r2C.toFixed(3)} |
         <strong>RMSE CHIRPS:</strong> ${rmseC.toFixed(2)}</p>
    </div>

    <div class="stats-center">
      <h3>${tituloPorcentaje}</h3>
      <p><strong>SENAMHI:</strong> ${pBase.toFixed(1)}%</p>
      <p><strong>Fecha inicio:</strong> ${formatearFecha(inicio, modoGrafico)}</p>
      <p><strong>Fecha final:</strong> ${formatearFecha(fin, modoGrafico)}</p>
    </div>

  </div>
`;
}

function descargarDatos(tipo) {
  if (!datosActuales || !estacionActual) {
    alert("Primero selecciona una estación.");
    return;
  }

  let dataProcesada;

  if (modoGrafico === "mensual") {
    dataProcesada = agruparMensualFrontend(datosActuales);
  } else {
    dataProcesada = datosActuales;
  }

  const wb = XLSX.utils.book_new();

  const datasets = Object.keys(dataProcesada);

  const crearHoja = (serie, nombreHoja) => {

    const rows = Object.entries(serie).map(([fecha, valor]) => ({
      "Fecha": fecha,
      [`${estacionActual} [mm]`]: valor
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 12 }, // Fecha
      { wch: 18 }  // Valor
    ];

    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  };

  if (tipo === "all") {
    
    datasets.forEach(ds => {
      crearHoja(dataProcesada[ds], ds.toUpperCase());
    });
  } else {
    if (!dataProcesada[tipo]) {
      alert("No existe ese dataset.");
      return;
    }
    crearHoja(dataProcesada[tipo], tipo.toUpperCase());
  }

  const nombreArchivo = `${estacionActual}_${modoGrafico}.xlsx`;

  XLSX.writeFile(wb, nombreArchivo);
}

document.getElementById("multi-dataset")
  .addEventListener("change", (e) => {
    datasetSeleccionado = e.target.value;
    actualizarGraficoMulti();
  });

document.getElementById("multi-estacion")
  .addEventListener("change", (e) => {

    const est = e.target.value;
    if (!est) return;

    // evitar duplicados
    if (!estacionesSeleccionadas.includes(est)) {
      estacionesSeleccionadas.push(est);
      renderSeleccionadas();
      actualizarGraficoMulti();
    }
  });
function renderSeleccionadas() {
  const container = document.getElementById("multi-seleccionadas");
  container.innerHTML = "";

  estacionesSeleccionadas.forEach((est, i) => {

    const chip = document.createElement("div");
    chip.className = "chip";

    chip.innerHTML = `
      ${est}
      <span data-index="${i}">✕</span>
    `;

    container.appendChild(chip);
  });

  // eliminar estación
  container.querySelectorAll("span").forEach(el => {
    el.addEventListener("click", (e) => {
      const index = e.target.dataset.index;
      estacionesSeleccionadas.splice(index, 1);

      renderSeleccionadas();
      actualizarGraficoMulti();
    });
  });
}

async function actualizarGraficoMulti() {

  if (estacionesSeleccionadas.length === 0) return;

  const datasets = [];

  for (const estacion of estacionesSeleccionadas) {

    const res = await fetch(`${API_URL}/data/${encodeURIComponent(estacion)}`);
    const data = await res.json();

    let serie;

    if (modoGrafico === "mensual") {
      serie = agruparMensualFrontend(data)[datasetSeleccionado];
    } else {
      serie = data[datasetSeleccionado];
    }

    const valores = Object.values(serie);

    datasets.push({
      label: estacion,
      data: valores,
      borderWidth: 1.5,
      tension: 0.2
    });
  }

  graficarMulti(datasets);
}

let chartMulti;

function graficarMulti(datasets) {

  const ctx = document.getElementById("grafico-multi").getContext("2d");

  if (chartMulti) chartMulti.destroy();

  chartMulti = new Chart(ctx, {
    type: "line",
    data: {
      labels: datasets[0].data.map((_, i) => i), // simple index
      datasets
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `Comparación de estaciones (${datasetSeleccionado})`
        }
      }
    }
  });
}
