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

/**
 * Extracts data from DACTE/CTE using Gemini Flash
 */
export const extractDataFromImage = async (base64Image: string): Promise<ExtractedData> => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error("Chave de API não configurada no sistema (API_KEY missing).");
    }

    const prompt = `Analise este documento de transporte (DACTE, CTE) com EXTREMA ATENÇÃO AOS DETALHES. O documento pode ser uma digitalização antiga ou de baixa qualidade.
    
    INSTRUÇÕES CRÍTICAS DE EXTRAÇÃO:

    1. NÚMERO DO DOCUMENTO (Prioridade Máxima):
       - Localize o campo "NÚMERO" ou "Nº".
       - ATENÇÃO: Muitas vezes o primeiro dígito está muito próximo da borda vertical ou linha da tabela. NÃO O IGNORE.
       - Exemplo: Se parecer "7695" mas houver um borrão ou linha antes, provavelmente é "27695" ou "17695". Olhe o contexto.
       - Formato esperado: Dígitos sequenciais. Remova zeros à esquerda (000123 -> 123).
       - SE HOUVER DÚVIDA no primeiro dígito, prefira incluir o dígito a ignorá-lo.

    2. DATA DE EMISSÃO (Correção de Ano):
       - Localize a data de emissão.
       - CUIDADO COM O ANO: O ano atual é 2025. Se o ano parecer "2023" ou "2028", verifique se não é um "5" mal impresso (o topo do 5 às vezes parece plano como um 3 em matriciais).
       - Prefira "2025" se a leitura for ambígua entre 2023/2025.
       - Formato: DD/MM/AAAA.

    3. SÉRIE:
       - Número pequeno, geralmente 1, 2, 307, etc.

    Retorne JSON estrito.`;

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

    // Normalize images: Backend might return 'url_preview' (legacy) or 'images' (array)
    // We prioritize 'images' array if it exists
    let images: string[] = [];
    
    if (Array.isArray(backendData.images) && backendData.images.length > 0) {
      images = backendData.images;
    } else if (backendData.url_preview) {
      images = [backendData.url_preview];
    }

    return {
        found: backendData.encontrado === true,
        message: backendData.mensagem || (backendData.encontrado ? "Documento localizado." : "Não encontrado."),
        images: images,
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
    
    // Expecting backend to return { suggestions: [{numero, serie}, ...] }
    if (data.suggestions && Array.isArray(data.suggestions)) {
      return data.suggestions.map((item: any) => ({
        numero: item.numero,
        serie: item.serie,
        label: `CTE ${item.numero} - Série ${item.serie}`
      }));
    }
    
    return [];
  } catch (error) {
    // Silent fail for suggestions
    console.warn("Suggestion Error", error);
    return [];
  }
};