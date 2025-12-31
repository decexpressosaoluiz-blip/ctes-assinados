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
  url_preview?: string;
  url_drive?: string;
  docInfo?: {
    numero: string;
    serie: string;
    data?: string;
  }
}

export type AppView = 'upload' | 'search' | 'settings';