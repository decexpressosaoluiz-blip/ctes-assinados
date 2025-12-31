import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData, SearchResult, UploadPayload } from "../../types";

// Configuration
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzzpMajuhVe1zy8J4u66y49kH3A0IrlC-v5OaJkDmgGZxvC_6B9QVohweQnqPVz4MyT/exec";
const GEMINI_API_KEY = process.env.API_KEY || "";

// Check configuration immediately
if (!GEMINI_API_KEY) {
  console.error("CONFIGURATION ERROR: API_KEY is missing. AI features will not work.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

/**
 * Extracts data from DACTE/CTE using Gemini Flash
 */
export const extractDataFromImage = async (base64Image: string): Promise<ExtractedData> => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error("Chave de API não configurada no sistema (API_KEY missing).");
    }

    const prompt = `Analise este documento DACTE/CTE. Extraia os seguintes campos baseados em sua localização visual típica:

    numeroDoc (Caixa Vermelha): Localizado no topo, centro-direita, abaixo do rótulo 'NÚMERO'. Exemplo na imagem: '000.001.467'. Você deve extrair APENAS os dígitos significativos, removendo zeros à esquerda e pontos. O resultado deve ser '1467'.
    
    dataEmissao (Caixa Azul): Localizado no topo, canto direito, na caixa 'DATA E HORA EMISSÃO'. Exemplo: '01/12/2025 15:25:08'. Extraia a data no formato DD/MM/AAAA.
    
    serie (Caixa Amarela): Localizado no topo, centro-esquerda, abaixo do rótulo 'SÉRIE'. Exemplo: '307'. Extraia o valor.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            numeroDoc: { type: Type.STRING },
            dataEmissao: { type: Type.STRING },
            serie: { type: Type.STRING }
          },
          required: ["numeroDoc", "dataEmissao", "serie"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text) as ExtractedData;

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw new Error("Falha ao processar imagem com IA. Tente novamente.");
  }
};

/**
 * Uploads data to Google Apps Script
 */
export const uploadToDrive = async (payload: UploadPayload): Promise<boolean> => {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    return true;
  } catch (error) {
    console.error("GAS Upload Error:", error);
    throw error;
  }
};

/**
 * Searches for a document
 */
export const searchDocument = async (docNumber: string): Promise<SearchResult> => {
  try {
    // FORCE NO CACHE with timestamp
    const cacheBuster = Date.now();
    const url = `${APPS_SCRIPT_URL}?q=${encodeURIComponent(docNumber.trim())}&_t=${cacheBuster}`;
    
    console.log(`[API] Searching: ${docNumber} -> ${url}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const backendData = await response.json();
    console.log("[API] Response:", backendData);

    // Map Backend (Portuguese) to Frontend (English/Internal)
    // Contract: { encontrado: boolean, nome: string, serie: string, url_preview: string, url_drive: string, mensagem: string }
    
    return {
        found: backendData.encontrado === true,
        message: backendData.mensagem || (backendData.encontrado ? "Documento localizado." : "Não encontrado."),
        url_preview: backendData.url_preview,
        url_drive: backendData.url_drive,
        docInfo: backendData.encontrado ? {
            numero: backendData.nome || docNumber,
            serie: backendData.serie || 'N/A',
            data: backendData.data // Optional, in case backend sends it
        } : undefined
    };

  } catch (error) {
    console.error("[API] Search Error:", error);
    return { 
        found: false, 
        message: "Erro de conexão com o servidor. Verifique sua internet." 
    };
  }
};