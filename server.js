const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const app = express();
app.use(cors());

function readCSV(filePath) {
  return new Promise((resolve) => {
    const out = [];
    if (!fs.existsSync(filePath)) return resolve(out);

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        // 👇 ajusta a tus columnas reales
        const fecha = new Date(row.date || row.fecha);
        const valor = parseFloat(row.tp || row.precip);

        if (!isNaN(fecha) && !isNaN(valor)) {
          out.push({ fecha, valor });
        }
      })
      .on("end", () => resolve(out));
  });
}

function agruparMensual(data) {
  const out = {};
  data.forEach(d => {
    const key = `${d.fecha.getFullYear()}-${String(d.fecha.getMonth()+1).padStart(2,'0')}`;
    out[key] = (out[key] || 0) + d.valor;
  });
  return out;
}

app.get("/data/:est", async (req, res) => {
  const est = req.params.est;

  const base = await readCSV(path.join(__dirname, "Data/Senamhi/Precip", `${est}.csv`));
  const imerg = await readCSV(path.join(__dirname, "Data/IMERG/Precip", `${est}.csv`));
  const chirps = await readCSV(path.join(__dirname, "Data/CHIRPS/Precip", `${est}.csv`));

  res.json({
    base: agruparMensual(base),
    imerg: agruparMensual(imerg),
    chirps: agruparMensual(chirps)
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor en puerto", PORT));