// =======================
// CONFIG API
// =======================
const API_URL = window.location.hostname === "127.0.0.1"
  ? "http://127.0.0.1:3000"
  : "https://aquaterraconsultora-api.onrender.com";

// =======================
// ESTADO GLOBAL
// =======================
let datosActuales = null;
let estacionActual = null;

let modoGrafico = "mensual";
let modoGraficoMulti = "mensual";

let estacionesSeleccionadas = [];
let datasetSeleccionado = "base";

let chart;
let chartMulti;

// =======================
// LOADER
// =======================
let intervaloLoader = null;
let intervaloLoaderMulti = null;

function iniciarLoader(idTexto) {
  let puntos = 1;
  const texto = document.getElementById(idTexto);
  if (!texto) return;

  return setInterval(() => {
    puntos = puntos >= 4 ? 1 : puntos + 1;
    texto.textContent = "Cargando datos" + ".".repeat(puntos);
  }, 400);
}

function detenerLoader(intervalo) {
  clearInterval(intervalo);
}

// =======================
// INICIO
// =======================
document.addEventListener("DOMContentLoaded", () => {

  const selectModo = document.getElementById("select-modo");
  const multiModo = document.getElementById("multi-modo");
  const multiDataset = document.getElementById("multi-dataset");

  // SINGLE
  if (selectModo) {
    selectModo.addEventListener("change", () => {
      modoGrafico = selectModo.value;

      if (datosActuales) {
        graficar(datosActuales);
        calcularEstadisticos(datosActuales);
      }
    });
  }

  // MULTI
  if (multiModo) {
    multiModo.addEventListener("change", (e) => {
      modoGraficoMulti = e.target.value;
      actualizarGraficoMulti();
    });
  }

  if (multiDataset) {
    multiDataset.addEventListener("change", (e) => {
      datasetSeleccionado = e.target.value;
      actualizarGraficoMulti();
    });
  }

  cargarEstaciones();
});

// =======================
// CARGAR ESTACIONES
// =======================
async function cargarEstaciones() {
  const res = await fetch('datos/Stations_coord_UTF_8.csv');
  const text = await res.text();

  const rows = text.split("\n").slice(1);
  const estaciones = [];

  rows.forEach(row => {
    const cols = row.split(",");
    const nombre = cols[2]?.trim();
    const departamento = cols[3]?.trim();

    if (!nombre || !departamento) return;

    estaciones.push({ nombre, departamento });
  });

  renderizarEstaciones(estaciones);
}

// =======================
// SELECTORES
// =======================
function renderizarEstaciones(estaciones) {

  const selectDepto = document.getElementById("select-depto");
  const selectEst = document.getElementById("select-estacion");
  const multiDepto = document.getElementById("multi-depto");
  const multiEst = document.getElementById("multi-estacion");

  const grupos = {};

  estaciones.forEach(est => {
    if (!grupos[est.departamento]) grupos[est.departamento] = [];
    grupos[est.departamento].push(est.nombre);
  });

  window.gruposEstaciones = grupos;

  const deptos = Object.keys(grupos).sort();

  const llenar = (select) => {
    select.innerHTML = `<option value="">-- Seleccione --</option>`;
    deptos.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      select.appendChild(opt);
    });
  };

  if (selectDepto) llenar(selectDepto);
  if (multiDepto) llenar(multiDepto);

  // SINGLE
  selectDepto?.addEventListener("change", () => {
    const depto = selectDepto.value;

    selectEst.innerHTML = "";

    if (!depto) return;

    grupos[depto].sort().forEach(nombre => {
      const opt = document.createElement("option");
      opt.value = nombre;
      opt.textContent = nombre;
      selectEst.appendChild(opt);
    });
  });

  selectEst?.addEventListener("change", () => {
    actualizarAnalisis(selectEst.value);
  });

  // MULTI
  multiDepto?.addEventListener("change", () => {
    const depto = multiDepto.value;

    multiEst.innerHTML = "";

    if (!depto) return;

    grupos[depto].sort().forEach(nombre => {
      const opt = document.createElement("option");
      opt.value = nombre;
      opt.textContent = nombre;
      multiEst.appendChild(opt);
    });
  });

  multiEst?.addEventListener("change", (e) => {
    const est = e.target.value;

    if (!est || estacionesSeleccionadas.includes(est)) return;

    estacionesSeleccionadas.push(est);
    renderSeleccionadas();
    actualizarGraficoMulti();
  });
}

// =======================
// SINGLE
// =======================
async function actualizarAnalisis(estacion) {

  const loader = document.getElementById("loader");
  let interval;

  if (loader) {
    loader.classList.remove("hidden");
    interval = iniciarLoader("texto-loader");
  }

  const res = await fetch(`${API_URL}/data/${encodeURIComponent(estacion)}`);
  const data = await res.json();

  datosActuales = data;
  estacionActual = estacion;

  graficar(data);
  calcularEstadisticos(data);

  if (loader) {
    loader.classList.add("hidden");
    detenerLoader(interval);
  }
}

// =======================
// AGRUPACIONES
// =======================
function agruparMensualFrontend(data) {
  const agrupar = (serie) => {
    const out = {};
    Object.entries(serie).forEach(([f, v]) => {
      if (v == null || isNaN(v)) return;
      const key = f.slice(0, 7);
      out[key] = (out[key] || 0) + v;
    });
    return out;
  };

  return {
    base: agrupar(data.base),
    imerg: agrupar(data.imerg),
    chirps: agrupar(data.chirps)
  };
}

function agruparMaximoMensual(data) {
  const agrupar = (serie) => {
    const out = {};
    Object.entries(serie).forEach(([f, v]) => {
      if (v == null || isNaN(v)) return;
      const key = f.slice(0, 7);
      out[key] = key in out ? Math.max(out[key], v) : v;
    });
    return out;
  };

  return {
    base: agrupar(data.base),
    imerg: agrupar(data.imerg),
    chirps: agrupar(data.chirps)
  };
}

// =======================
// MÉTRICAS ROBUSTAS
// =======================
function filtrarPares(obs, sim) {
  const o = [], s = [];

  for (let i = 0; i < obs.length; i++) {
    if (obs[i] != null && sim[i] != null && !isNaN(obs[i]) && !isNaN(sim[i])) {
      o.push(obs[i]);
      s.push(sim[i]);
    }
  }
  return [o, s];
}

function rmse(obs, sim) {
  [obs, sim] = filtrarPares(obs, sim);
  return Math.sqrt(obs.reduce((a, v, i) => a + (v - sim[i]) ** 2, 0) / obs.length);
}

function r2(obs, sim) {
  [obs, sim] = filtrarPares(obs, sim);
  const mean = obs.reduce((a, b) => a + b, 0) / obs.length;
  let ssTot = 0, ssRes = 0;

  for (let i = 0; i < obs.length; i++) {
    ssTot += (obs[i] - mean) ** 2;
    ssRes += (obs[i] - sim[i]) ** 2;
  }

  return 1 - ssRes / ssTot;
}

function nash(obs, sim) {
  [obs, sim] = filtrarPares(obs, sim);
  const mean = obs.reduce((a, b) => a + b, 0) / obs.length;

  let num = 0, den = 0;
  for (let i = 0; i < obs.length; i++) {
    num += (obs[i] - sim[i]) ** 2;
    den += (obs[i] - mean) ** 2;
  }

  return 1 - num / den;
}

// =======================
// MULTI
// =======================
async function actualizarGraficoMulti() {

  if (estacionesSeleccionadas.length === 0) return;

  const loader = document.getElementById("multi-loader");
  let interval;

  if (loader) {
    loader.classList.remove("hidden");
    interval = iniciarLoader("multi-texto-loader");
  }

  const series = [];

  for (const est of estacionesSeleccionadas) {

    const res = await fetch(`${API_URL}/data/${encodeURIComponent(est)}`);
    const data = await res.json();

    let serie;

    if (modoGraficoMulti === "mensual") {
      serie = agruparMensualFrontend(data)[datasetSeleccionado];
    } else {
      serie = agruparMaximoMensual(data)[datasetSeleccionado];
    }

    series.push({ nombre: est, data: serie });
  }

  // asegurar referencia primero
  series.sort((a, b) => a.nombre === estacionesSeleccionadas[0] ? -1 : 1);

  const dataFinal = unificarMulti(series);

  graficarMulti(dataFinal);
  renderMetricasMulti(dataFinal);

  if (loader) {
    loader.classList.add("hidden");
    detenerLoader(interval);
  }
}

// =======================
// UNIFICAR MULTI
// =======================
function unificarMulti(series) {

  const keys = new Set();

  series.forEach(s => {
    Object.keys(s.data).forEach(k => keys.add(k));
  });

  const labels = Array.from(keys).sort();

  const datasets = series.map((s, i) => ({
    label: s.nombre,
    data: labels.map(f => s.data[f] ?? null),
    borderColor: generarColor(i),
    tension: 0.2
  }));

  return { labels, datasets };
}

// =======================
// COLORES
// =======================
function generarColor(i) {
  const colores = [
    "#1f77b4","#d62728","#2ca02c",
    "#9467bd","#ff7f0e","#17becf"
  ];
  return colores[i % colores.length];
}

// =======================
// METRICAS MULTI
// =======================
function renderMetricasMulti(data) {

  const el = document.getElementById("estadisticos-multi");
  if (!el) return;

  const base = data.datasets[0].data;

  const html = data.datasets.slice(1).map(ds => {

    return `
      <p><strong>${ds.label}</strong> |
      Nash: ${nash(base, ds.data).toFixed(3)} |
      R²: ${r2(base, ds.data).toFixed(3)} |
      RMSE: ${rmse(base, ds.data).toFixed(2)}</p>
    `;
  }).join("");

  el.innerHTML = `
    <h3>Métricas (ref: ${data.datasets[0].label})</h3>
    ${html}
  `;
}
