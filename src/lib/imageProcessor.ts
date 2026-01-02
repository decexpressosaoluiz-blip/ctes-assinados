import { ProcessedImage } from '../../types';

export const processImage = async (file: File, rotation: number = 0): Promise<ProcessedImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const img = new Image();
      
      img.onload = () => {
        // Use OffscreenCanvas if available for better performance, else standard canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no alpha channel

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // 1. Resize Logic (Robust)
        const MAX_WIDTH = 1280; 
        let width = img.width;
        let height = img.height;

        // Ensure we check BOTH dimensions to prevent massive canvases
        if (width > MAX_WIDTH || height > MAX_WIDTH) {
            const ratio = Math.min(MAX_WIDTH / width, MAX_WIDTH / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }

        // 2. Setup Canvas based on Rotation
        // Normalize rotation to 0-360 positive
        const normRot = (rotation % 360 + 360) % 360;
        const isSideways = normRot === 90 || normRot === 270;

        // Determine canvas dimensions
        // If sideways, width becomes height and height becomes width
        if (isSideways) {
            canvas.width = height;
            canvas.height = width;
        } else {
            canvas.width = width;
            canvas.height = height;
        }

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 3. Center Rotation Logic (Proven & Robust)
        ctx.save();
        
        // Translate to the CENTER of the canvas
        ctx.translate(canvas.width / 2, canvas.height / 2);
        
        // Rotate
        ctx.rotate((normRot * Math.PI) / 180);
        
        // Draw Image CENTERED
        // Note: We always draw using the SCALED original dimensions (width, height)
        // centered around (0,0) of the rotated context.
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
        
        ctx.restore();

        // 4. Fast Compression
        const quality = 0.70; 
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        const base64 = dataUrl.split(',')[1];
        const sizeKb = Math.round((base64.length * 0.75) / 1024);

        resolve({
          base64,
          previewUrl: dataUrl,
          width: canvas.width,
          height: canvas.height,
          sizeKb
        });
      };

      img.onerror = (err) => reject(new Error('Failed to load image'));
      
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    
    reader.onerror = (err) => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};