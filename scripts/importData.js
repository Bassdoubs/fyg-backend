import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Airport, Airline } from '../models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger le fichier .env depuis le répertoire parent
dotenv.config({ path: path.join(__dirname, '../.env') });

// Connexion à MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'parkings'
}).then(() => {
  console.log('Connected to MongoDB');
  importData();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Fonction pour parser une ligne CSV en gérant les guillemets
function parseCSVLine(line) {
  const values = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim());
  return values;
}

async function importData() {
  try {
    // Import des compagnies aériennes
    const airlinesPath = path.join(__dirname, '../../src/data/airlines.md');
    const airlinesContent = fs.readFileSync(airlinesPath, 'utf8');
    
    const airlines = airlinesContent.split('\n')
      .filter(line => line.trim() && !line.startsWith('ICAO'))
      .map(line => {
        const [icao, callsign, name, country] = line.split('\t');
        return {
          icao: icao.trim(),
          callsign: callsign === '(None)' ? null : callsign.trim(),
          name: name.trim(),
          country: country.replace(/Flag of .*? /, '').trim()
        };
      });

    // Suppression des données existantes
    await Airline.deleteMany({});
    console.log('Anciennes données des compagnies aériennes supprimées');

    // Insertion des nouvelles données
    await Airline.insertMany(airlines);
    console.log(`${airlines.length} compagnies aériennes importées`);

    // Import des aéroports
    const airportsPath = path.join(__dirname, '../../src/data/airports.csv');
    const airportsContent = fs.readFileSync(airportsPath, 'utf8');
    
    const airports = airportsContent.split('\n')
      .filter(line => line.trim() && !line.startsWith('"id"'))
      .map(line => {
        const values = parseCSVLine(line);
        // Les index correspondent aux colonnes du CSV
        const icao = values[12]?.replace(/"/g, '').trim(); // icao_code
        if (!icao || icao.length !== 4) return null;

        return {
          icao: icao,
          name: values[3]?.replace(/"/g, '').trim(), // name
          city: values[10]?.replace(/"/g, '').trim(), // municipality
          country: values[8]?.replace(/"/g, '').trim(), // iso_country
          latitude: parseFloat(values[4] || 0), // latitude_deg
          longitude: parseFloat(values[5] || 0), // longitude_deg
          elevation: Math.round(parseFloat(values[6] || 0)), // elevation_ft
          timezone: '' // Non disponible dans le CSV
        };
      })
      .filter(airport => airport !== null && airport.icao.match(/^[A-Z]{4}$/));

    // Suppression des données existantes
    await Airport.deleteMany({});
    console.log('Anciennes données des aéroports supprimées');

    // Insertion des nouvelles données
    await Airport.insertMany(airports);
    console.log(`${airports.length} aéroports importés`);

    console.log('Import terminé avec succès');
    process.exit(0);
  } catch (err) {
    console.error('Erreur lors de l\'import:', err);
    process.exit(1);
  }
} 