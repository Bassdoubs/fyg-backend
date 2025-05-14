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

// Liste des dépendances essentielles à vérifier
const essentialDependencies = [
  'express',
  'cors',
  'mongoose',
  'dotenv',
  'helmet',
  'jsonwebtoken',
  'cloudinary',
  'bcryptjs',
  'multer',
  'node-cron',
  'zod'
];

// Vérifier si le répertoire node_modules existe
if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
  console.log('Répertoire node_modules non trouvé, exécution de npm install...');
  try {
    execSync('npm install --no-save', { stdio: 'inherit', cwd: rootDir });
    console.log('Installation de base terminée!');
  } catch (error) {
    console.error('Erreur lors de l\'installation des dépendances:', error);
  }
}

// Vérifier si toutes les dépendances essentielles sont installées
let missingDependencies = [];
for (const dep of essentialDependencies) {
  if (!fs.existsSync(path.join(rootDir, 'node_modules', dep))) {
    console.log(`Module ${dep} non trouvé`);
    missingDependencies.push(dep);
  }
}

// Installer les dépendances manquantes
if (missingDependencies.length > 0) {
  console.log(`Installation des modules manquants: ${missingDependencies.join(', ')}...`);
  try {
    execSync(`npm install ${missingDependencies.join(' ')} --no-save`, { 
      stdio: 'inherit', 
      cwd: rootDir 
    });
    console.log('Installation des dépendances manquantes terminée!');
  } catch (error) {
    console.error('Erreur lors de l\'installation des dépendances manquantes:', error);
    // On continue quand même, au cas où certaines se sont installées correctement
  }
  
  // Vérification finale
  let stillMissing = [];
  for (const dep of missingDependencies) {
    if (!fs.existsSync(path.join(rootDir, 'node_modules', dep))) {
      stillMissing.push(dep);
    }
  }
  
  if (stillMissing.length > 0) {
    console.error(`ATTENTION: Les modules suivants sont toujours manquants: ${stillMissing.join(', ')}`);
    console.error('Tentative de solution de secours...');
    try {
      execSync('npm install --production', { stdio: 'inherit', cwd: rootDir });
    } catch (error) {
      console.error('Échec de la solution de secours:', error);
    }
  }
}

console.log('Vérification des dépendances complète!');
console.log('Démarrage du serveur...'); 