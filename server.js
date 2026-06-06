const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const app = express();
app.use(cors());

// =======================
// READ CSV
// =======================
function readCSV(filePath) {
  return new Promise((resolve) => {
    const rows = [];

    if (!fs.existsSync(filePath)) return resolve({});

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const fechaRaw = row.date || row.fecha;
        const valorRaw = row.tp || row.TP || row.Pr;

        const fecha = new Date(fechaRaw);
        if (isNaN(fecha)) return;

        let valor = null;

        // Diferenciar 0 de missing
        if (valorRaw !== undefined && valorRaw !== "") {
          const parsed = parseFloat(valorRaw);
          valor = isNaN(parsed) ? null : parsed;
        }

        rows.push({ fecha, valor });
      })
      .on("end", () => {

        // =========================
        // SERIE DIARIA
        // =========================
        const serie = {};

        rows.forEach(d => {
          const key = d.fecha.toISOString().split("T")[0];
          serie[key] = d.valor; // puede ser 0 o null
        });

        // =========================
        // COMPLETAR FECHAS
        // =========================
        const fechas = Object.keys(serie).sort();

        if (fechas.length === 0) {
          return resolve(serie);
        }

        const inicio = new Date(fechas[0]);
        const fin = new Date(fechas[fechas.length - 1]);

        const resultado = {};

        for (
          let d = new Date(inicio);
          d <= fin;
          d.setDate(d.getDate() + 1)
        ) {
          const key = d.toISOString().split("T")[0];
          resultado[key] = serie[key] ?? null;
        }

        resolve(resultado);
      });
  });
}

// =======================
// AGRUPAR MENSUAL
// =======================
function agruparMensual(serieDiaria) {
  const mensual = {};

  Object.entries(serieDiaria).forEach(([fecha, valor]) => {
    if (valor === null) return;

    const [y, m] = fecha.split("-");
    const key = `${y}-${m}`;

    if (!mensual[key]) mensual[key] = 0;
    mensual[key] += valor;
  });

  return mensual;
}

// =======================
// ENDPOINT
// =======================
app.get("/data/:est", async (req, res) => {
  const est = req.params.est;

  try {
    const base = await readCSV(
      path.join(__dirname, "Data/Senamhi/Precip", `${est}.csv`)
    );

    const imerg = await readCSV(
      path.join(__dirname, "Data/IMERG/Precip", `${est}.csv`)
    );

    const chirps = await readCSV(
      path.join(__dirname, "Data/CHIRPS/Precip", `${est}.csv`)
    );

    const era5 = await readCSV(
      path.join(__dirname, "Data/ERA5/Precip", `${est}.csv`)
    );

    res.json({
      base,
      imerg,
      chirps,
      era5,

      base_mensual: agruparMensual(base),
      imerg_mensual: agruparMensual(imerg),
      chirps_mensual: agruparMensual(chirps),
      era5_mensual: agruparMensual(era5)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error leyendo datos" });
  }
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor en puerto", PORT);
});
