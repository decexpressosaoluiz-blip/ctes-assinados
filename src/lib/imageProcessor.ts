import { ProcessedImage } from '../../types';

export const processImage = async (file: File): Promise<ProcessedImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // 1. Resize logic (Max 1500px width)
        const MAX_WIDTH = 1500;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // 2. Image Manipulation (Grayscale + Moderate Contrast)
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Reduced contrast factor (1.1 instead of 1.3) to prevent lighter digits 
        // or digits near borders from being washed out into white/black extremes.
        const contrast = 1.1; 
        const intercept = 128 * (1 - contrast);

        for (let i = 0; i < data.length; i += 4) {
          // Grayscale (Luma formula)
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          
          // Apply Contrast
          let newColor = gray * contrast + intercept;
          newColor = Math.min(255, Math.max(0, newColor)); // Clamp

          data[i] = newColor;     // R
          data[i + 1] = newColor; // G
          data[i + 2] = newColor; // B
          // Alpha remains unchanged
        }

        ctx.putImageData(imageData, 0, 0);

        // 3. Compress to JPEG (Quality 0.6 - 0.7)
        // We start at 0.7 and lower if needed to hit < 250KB target
        let quality = 0.7;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        // Simple check size
        while (dataUrl.length > 330000 && quality > 0.3) { // ~250KB in base64 length approx 333k chars
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const base64 = dataUrl.split(',')[1];
        const sizeKb = Math.round((base64.length * 0.75) / 1024);

        resolve({
          base64,
          previewUrl: dataUrl,
          width,
          height,
          sizeKb
        });
      };
      img.onerror = (err) => reject(err);
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};