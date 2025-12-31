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

        // 1. Resize Logic
        const MAX_WIDTH = 1280; 
        let width = img.width;
        let height = img.height;

        // Calculate dimensions based on rotation
        // If rotating 90 or 270, we swap width/height logic for the canvas container
        const isRotatedSideways = rotation === 90 || rotation === 270;
        
        // Resize logic applies to the *visual* orientation
        let srcWidth = width;
        let srcHeight = height;

        // We scale down the source if it's too big
        if (width > MAX_WIDTH || height > MAX_WIDTH) { // Simple check, refine if needed
            const ratio = Math.min(MAX_WIDTH / width, MAX_WIDTH / height);
            // We don't strictly enforce 1280px here for all cases, but let's keep it safe
             if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
             }
        }
        
        // Set canvas dimensions. 
        // If rotated 90/270, the canvas width is the image's height
        canvas.width = isRotatedSideways ? height : width;
        canvas.height = isRotatedSideways ? width : height;

        // 2. Draw & Rotate
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        
        // Translate to center of canvas to rotate around center
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        
        // Draw image centered (subtracting half dimensions)
        // Note: We draw based on the *original* (scaled) width/height, 
        // because the context is rotated.
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
        
        ctx.restore();

        // 3. Fast Compression (Single Pass)
        const quality = 0.65;
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