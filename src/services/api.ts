import { GoogleGenAI, Type } from "@google/genai";
import { ExtractedData, SearchResult, UploadPayload, SearchSuggestion } from "../../types";

// Configuration
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzA9xFaLJ2UKEKUP4O-eM1zVGxaq51oZDxFjQHxlLOiy044xTftAwNnigxMdC3Q1PyH/exec";
const GEMINI_API_KEY = process.env.API_KEY || "";

// Check configuration immediately
if (!GEMINI_API_KEY) {
  console.error("CONFIGURATION ERROR: API_KEY is missing. AI features will not work.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Helper: Delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extracts data from DACTE/CTE using Gemini Flash with Retry Logic
 */
export const extractDataFromImage = async (base64Image: string): Promise<ExtractedData> => {
  if (!GEMINI_API_KEY) {
    throw new Error("Chave de API não configurada no sistema (API_KEY missing).");
  }

  const prompt = `Analise este documento de transporte (DACTE, CTE) com EXTREMA ATENÇÃO.
    
    INSTRUÇÕES DE EXTRAÇÃO E VALIDAÇÃO DE QUALIDADE:

    1. NÚMERO DO DOCUMENTO:
       - Localize "NÚMERO" ou "Nº".
       - Formato: Dígitos sequenciais. Remova zeros à esquerda.
       
    2. DATA DE EMISSÃO:
       - Formato: DD/MM/AAAA.
       - Cuidado com o ano atual (2025).

    3. SÉRIE:
       - Geralmente 1, 2, 307.

    4. CRITÉRIOS DE REVISÃO HUMANA (needsReview):
       Defina "needsReview" como TRUE se:
       - A imagem estiver muito borrada, escura ou de baixa resolução.
       - O número do documento estiver cortado na borda.
       - Você tiver QUALQUER dúvida sobre um dígito (ex: não sabe se é '3' ou '8').
       - O documento parecer estar "deitado" (rotação incorreta) dificultando a leitura.
       - Faltar campos obrigatórios (Número, Data ou Série).

       Se a leitura estiver CLARA e INEQUÍVOCA, defina "needsReview" como FALSE.

    Retorne JSON estrito.`;

  let attempt = 0;
  const maxRetries = 4; // Increased retries for safety

  while (attempt < maxRetries) {
    try {
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
              serie: { type: Type.STRING },
              needsReview: { type: Type.BOOLEAN, description: "True se a imagem estiver ruim, cortada ou ambígua." }
            },
            required: ["numeroDoc", "dataEmissao", "serie", "needsReview"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      // Robust JSON Parsing: Strip Markdown blocks if present
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      return JSON.parse(cleanText) as ExtractedData;

    } catch (error: any) {
      // Robust Error Parsing: Convert everything to string to catch nested JSON errors
      const errorStr = JSON.stringify(error);
      
      const isQuotaError = 
        errorStr.includes("429") || 
        errorStr.includes("RESOURCE_EXHAUSTED") || 
        errorStr.includes("quota") ||
        error?.status === 429 ||
        error?.error?.code === 429;

      const isServerOverload = 
        errorStr.includes("503") || 
        error?.status === 503 ||
        error?.error?.code === 503;

      if ((isQuotaError || isServerOverload) && attempt < maxRetries - 1) {
        attempt++;
        // Aggressive Backoff: 4s, 8s, 16s... gives the quota bucket time to refill
        const waitTime = Math.pow(2, attempt) * 2000;
        console.warn(`[AI] Erro de Cota/Servidor (${isQuotaError ? '429' : '503'}). Retentando em ${waitTime/1000}s... (Tentativa ${attempt}/${maxRetries})`);
        await delay(waitTime);
        continue;
      }

      console.error("Gemini Extraction Fatal Error:", error);
      
      if (isQuotaError) {
        throw new Error("Sistema de IA sobrecarregado (Cota Excedida). Aguarde alguns segundos e tente novamente.");
      }
      throw new Error("Falha ao processar imagem com IA. Verifique a qualidade da imagem.");
    }
  }

  throw new Error("Falha de conexão com IA após múltiplas tentativas.");
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
    const cacheBuster = Date.now();
    const url = `${APPS_SCRIPT_URL}?q=${encodeURIComponent(docNumber.trim())}&_t=${cacheBuster}`;
    
    console.log(`[API] Searching: ${docNumber}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const backendData = await response.json();
    
    let images: string[] = [];
    const extractImages = (data: any) => {
        const potentialKeys = ['images', 'imagem', 'url_preview', 'link', 'url', 'arquivo', 'file'];
        for (const key of potentialKeys) {
            const val = data[key] || data[key.toUpperCase()] || data[key.charAt(0).toUpperCase() + key.slice(1)];
            if (val) {
                if (Array.isArray(val)) return val;
                if (typeof val === 'string' && val.includes('http')) return [val];
            }
        }
        return [];
    };

    images = extractImages(backendData);

    return {
        found: backendData.encontrado === true || images.length > 0,
        message: backendData.mensagem || (backendData.encontrado ? "Documento localizado." : "Não encontrado."),
        images: images,
        url_drive: backendData.url_drive,
        docInfo: backendData.encontrado ? {
            numero: backendData.nome || docNumber,
            serie: backendData.serie || 'N/A',
            data: backendData.data
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

/**
 * Gets Autocomplete Suggestions
 */
export const getSearchSuggestions = async (query: string): Promise<SearchSuggestion[]> => {
  try {
    if (!query || query.length < 2) return [];

    const url = `${APPS_SCRIPT_URL}?action=suggest&q=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    
    if (!response.ok) return [];

    const data = await response.json();
    
    if (data.suggestions && Array.isArray(data.suggestions)) {
      return data.suggestions.map((item: any) => ({
        numero: item.numero,
        serie: item.serie,
        label: `CTE ${item.numero} - Série ${item.serie}`
      }));
    }
    
    return [];
  } catch (error) {
    return [];
  }
};