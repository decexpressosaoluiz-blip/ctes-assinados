import * as pdfjsLib from 'pdfjs-dist';

// Configure worker source to match the library version from ESM.sh
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

/**
 * Converts the first page of a PDF file to a JPEG File object.
 * @param file The PDF File object
 * @returns A Promise resolving to a JPEG File object
 */
export const convertPdfToJpeg = async (file: File): Promise<File> => {
  return new Promise(async (resolve, reject) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      if (pdf.numPages === 0) {
        throw new Error('PDF is empty');
      }

      // Get the first page
      const page = await pdf.getPage(1);
      
      // Scale 3.0 provides high resolution for AI OCR, fixing issues with small text or similar digits
      const scale = 3.0;
      const viewport = page.getViewport({ scale });
      
      // Prepare canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Canvas context not available');
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Render PDF page into canvas context
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      
      // Convert to Blob/File
      canvas.toBlob((blob) => {
        if (blob) {
          // Replace extension .pdf with .jpg
          const newFileName = file.name.replace(/\.pdf$/i, '.jpg');
          const newFile = new File([blob], newFileName, { type: 'image/jpeg' });
          resolve(newFile);
        } else {
          reject(new Error('Canvas to Blob conversion failed'));
        }
      }, 'image/jpeg', 0.90); // Increased quality to 0.90 for better detail preservation
      
    } catch (error) {
      console.error('PDF Conversion Error:', error);
      reject(error);
    }
  });
};