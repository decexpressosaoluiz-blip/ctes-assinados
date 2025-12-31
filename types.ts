export interface ProcessedImage {
  base64: string; // Raw base64 string without prefix
  previewUrl: string; // Data URL for display
  width: number;
  height: number;
  sizeKb: number;
}

export interface ExtractedData {
  numeroDoc: string;
  dataEmissao: string;
  serie: string;
}

export interface UploadPayload {
  ano: string;
  mes: string;
  dia: string;
  serie: string;
  numeroDoc: string;
  mimeType: string;
  imagemBase64: string;
}

export interface SearchResult {
  found: boolean;
  message?: string;
  images?: string[]; // Array of image URLs for multi-page/duplicate results
  url_drive?: string; // Folder link or fallback link
  docInfo?: {
    numero: string;
    serie: string;
    data?: string;
  }
}

export interface SearchSuggestion {
  numero: string;
  serie: string;
  label: string; // "CTE 12345 (Série 1)"
}

export type AppView = 'upload' | 'search' | 'settings';

// BATCH UPLOAD SPECIFIC TYPES
export type BatchItemStatus = 'processing_image' | 'analyzing_ai' | 'ready' | 'queued' | 'uploading' | 'success' | 'error';

export interface BatchItem {
  id: string;
  file: File;
  previewUrl?: string;
  base64?: string;
  data: ExtractedData;
  status: BatchItemStatus;
  errorMessage?: string;
  uploadProgress?: number;
}