
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
  needsReview?: boolean; // New flag for AI confidence
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
// Added 'paused' status to allow skipping specific items
export type BatchItemStatus = 'processing_image' | 'pending_ai' | 'analyzing_ai' | 'ready' | 'queued' | 'paused' | 'uploading' | 'success' | 'error';

export interface BatchItem {
  id: string;
  file: File;
  previewUrl?: string; // If undefined, system will try to generate it (for PDFs)
  base64?: string;
  rotation?: number; // 0, 90, 180, 270
  data: ExtractedData;
  status: BatchItemStatus;
  errorMessage?: string;
  uploadProgress?: number;
}
