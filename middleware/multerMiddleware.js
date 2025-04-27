import multer from 'multer';

// Configuration simple pour stocker les fichiers en mémoire tampon
// Cela convient pour les petits fichiers comme les images de carte ou les logos
// avant de les envoyer à Cloudinary.
const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

export default upload; 