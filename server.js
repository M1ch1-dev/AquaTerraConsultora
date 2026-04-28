const express = require("express");
const fs = require("fs");
const csv = require("csv-parser");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

const PORT = 3000;

// 📥 leer CSV
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];

    if (!fs.existsSync(filePath)) {
      return resolve([]); // si no existe, devuelve vacío
    }

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (err) => reject(err));
  });
}

// 📊 agrupar mensual
function agruparMensual(data) {
  const mensual = {};

  data.forEach(row => {
    const fecha = new Date(row.date);   // 👈 ajusta nombre columna
    const valor = parseFloat(row.tp); // 👈 ajusta nombre columna

    if (isNaN(valor)) return;

    const key = `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}`;

    if (!mensual[key]) mensual[key] = 0;
    mensual[key] += valor;
  });

  return mensual;
}

// 🚀 endpoint principal
app.get("/data/:estacion", async (req, res) => {
  const est = req.params.estacion;

  const basePath = path.join(__dirname, "Data/Senamhi/Precip", `${est}.csv`);
  console.log("Buscando:", basePath);
  console.log("EXISTE:", fs.existsSync(basePath));

  try {
    const base = await readCSV(path.join(__dirname, "Data/Senamhi/Precip", `${est}.csv`));
    const imerg = await readCSV(path.join(__dirname, "Data/IMERG/Precip", `${est}.csv`));
    const chirps = await readCSV(path.join(__dirname, "Data/CHIRPS/Precip", `${est}.csv`));

    res.json({
      base: agruparMensual(base),
      imerg: agruparMensual(imerg),
      chirps: agruparMensual(chirps)
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});

