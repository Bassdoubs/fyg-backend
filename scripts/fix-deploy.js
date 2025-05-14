// Script de correction pour Railway
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Obtenir le chemin du répertoire courant
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=== Script de correction pour le déploiement Railway ===');

// Vérifier si le répertoire node_modules existe
if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
  console.log('Répertoire node_modules non trouvé, exécution de npm install...');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: rootDir });
  } catch (error) {
    console.error('Erreur lors de l\'installation des dépendances:', error);
    process.exit(1);
  }
}

// Vérifier spécifiquement si express est installé
if (!fs.existsSync(path.join(rootDir, 'node_modules/express'))) {
  console.log('Module express non trouvé, installation de express...');
  try {
    execSync('npm install express', { stdio: 'inherit', cwd: rootDir });
  } catch (error) {
    console.error('Erreur lors de l\'installation d\'express:', error);
    process.exit(1);
  }
}

console.log('Vérification des dépendances complète!');
console.log('Démarrage du serveur...'); 