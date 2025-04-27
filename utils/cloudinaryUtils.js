import { v2 as cloudinary } from 'cloudinary';

// Helper function pour uploader vers Cloudinary depuis un buffer
export const uploadToCloudinary = (buffer, icao) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "airline_logos", // Dossier sur Cloudinary
        public_id: icao, // Utiliser l'ICAO comme ID public
        overwrite: true, // Remplacer si même public_id existe
        resource_type: "image"
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    // Envoyer le buffer au stream
    uploadStream.end(buffer);
  });
};

// Helper function pour supprimer de Cloudinary
export const deleteFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, { resource_type: "image" }, (error, result) => {
      if (error) {
        // Ne pas rejeter si l'erreur est "not found", l'image n'existe juste plus
        if (error.http_code === 404) {
           console.log(`Image ${publicId} non trouvée sur Cloudinary, suppression ignorée.`);
           resolve({ result: 'not found' });
        } else {
           reject(error);
        }
      } else {
        resolve(result);
      }
    });
  });
}; 