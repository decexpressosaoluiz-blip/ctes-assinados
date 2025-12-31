import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UploadCloud, Plus, Trash2, AlertTriangle, CheckCircle, Play, FileInput, StopCircle, Clock } from 'lucide-react';
import { processImage } from '../../lib/imageProcessor';
import { extractDataFromImage, uploadToDrive } from '../../services/api';
import { BatchItem, ExtractedData } from '../../types';
import { FileCard } from './FileCard';
import { ImageZoomModal } from './ImageZoomModal';
import { Button } from '../ui/Button';
import { convertPdfToJpeg } from '../../utils/pdfConverter';

const MAX_BATCH_SIZE = 150; // Increased for large batches
const SAFETY_DELAY_MS = 15000; // 15 Seconds Safety Brake

export const BatchManager: React.FC = () => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [statusMessage, setStatusMessage] = useState("");
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<boolean>(false);

  // Stats
  const successCount = items.filter(i => i.status === 'success').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const queuedCount = items.filter(i => i.status === 'queued').length;

  // Prevent closing tab while running
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRunning) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRunning]);

  // 1. Lazy File Selection (Low Memory Usage)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const filesArray: File[] = Array.from(e.target.files);
    
    if (items.length + filesArray.length > MAX_BATCH_SIZE) {
      alert(`Limite de segurança: ${MAX_BATCH_SIZE} arquivos por lote.`);
      return;
    }

    // Just store the file handle. DO NOT PROCESS IMAGE YET.
    const newItems: BatchItem[] = filesArray.map(file => ({
      id: crypto.randomUUID(),
      file,
      data: { numeroDoc: '', serie: '', dataEmissao: '' },
      status: 'queued' // Waiting in line
    }));

    setItems(prev => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 2. The Robust Sequential Loop
  const startQueue = async () => {
    if (isRunning) return;
    setIsRunning(true);
    abortRef.current = false;
    setStatusMessage("Iniciando fila de processamento...");

    // Get all items that need processing
    // We iterate by index to update the main state correctly
    // Note: We use a fresh reference to 'items' via functional state updates in the loop, 
    // but the loop driver needs to know order.
    
    // Simple strategy: Iterate through the IDs that are currently 'queued' or 'error' (retry)
    const queueIds = items
        .filter(i => i.status === 'queued' || i.status === 'error')
        .map(i => i.id);

    let processedCount = 0;
    const total = queueIds.length;

    for (let i = 0; i < total; i++) {
        if (abortRef.current) {
            setStatusMessage("Processamento pausado pelo usuário.");
            break;
        }

        const id = queueIds[i];
        setCurrentIdx(i + 1);
        
        // Find current item object (fresh from state)
        // We need to retrieve the File object which is stored in state
        let currentItem: BatchItem | undefined;
        setItems(prev => {
            currentItem = prev.find(item => item.id === id);
            return prev;
        });

        if (!currentItem) continue;

        try {
            setStatusMessage(`Processando item ${i + 1}/${total}: Preparando imagem...`);
            
            // --- STEP A: PREPARE IMAGE (Memory intensive part) ---
            updateItemStatus(id, 'processing_image');
            
            let fileToProcess = currentItem.file;
            
            // Convert PDF if needed
            if (fileToProcess.type === 'application/pdf') {
                try {
                    fileToProcess = await convertPdfToJpeg(fileToProcess);
                } catch (pdfErr) {
                    throw new Error("Falha ao converter PDF.");
                }
            }

            // Resize/Compress
            const processed = await processImage(fileToProcess);
            
            // Update state with Preview (so user sees it temporarily)
            setItems(prev => prev.map(item => item.id === id ? {
                ...item,
                base64: processed.base64,
                previewUrl: processed.previewUrl
            } : item));

            // --- STEP B: AI EXTRACTION ---
            setStatusMessage(`Processando item ${i + 1}/${total}: Analisando com IA...`);
            updateItemStatus(id, 'analyzing_ai');

            // Call Gemini
            // Note: extractDataFromImage already has internal retry for 429
            const extractedData = await extractDataFromImage(processed.base64);

            setItems(prev => prev.map(item => item.id === id ? {
                ...item,
                data: extractedData
            } : item));

            // --- STEP C: AUTO UPLOAD ---
            setStatusMessage(`Processando item ${i + 1}/${total}: Enviando para o Drive...`);
            updateItemStatus(id, 'uploading');

            const [dia, mes, ano] = extractedData.dataEmissao.includes('/') 
                ? extractedData.dataEmissao.split('/') 
                : ['', '', ''];

            await uploadToDrive({
                ano: ano || '2025',
                mes: mes || '01',
                dia: dia || '01',
                serie: extractedData.serie || 'N/A',
                numeroDoc: extractedData.numeroDoc,
                mimeType: 'image/jpeg',
                imagemBase64: processed.base64
            });

            // --- STEP D: SUCCESS & CLEANUP ---
            setItems(prev => prev.map(item => item.id === id ? {
                ...item,
                status: 'success',
                base64: undefined, // CLEAR RAM
                // We keep previewUrl if you want, or clear it too for max memory saving
                // For 100 items, clearing previewUrl is recommended if standard DOM img tags are used.
                // Let's keep it for now but if memory issues persist, clear it.
            } : item));

            processedCount++;

            // --- STEP E: SAFETY BRAKE (The 15s Wait) ---
            if (i < total - 1) { // Don't wait after the last one
                for (let s = 15; s > 0; s--) {
                    if (abortRef.current) break;
                    setStatusMessage(`Sucesso! Aguardando ${s}s para o próximo (Proteção de Cota)...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

        } catch (err: any) {
            console.error(`Error processing item ${id}:`, err);
            setItems(prev => prev.map(item => item.id === id ? {
                ...item,
                status: 'error',
                errorMessage: err.message || "Erro desconhecido",
                base64: undefined // Clear RAM even on error
            } : item));
            
            // On error, we still wait a bit just in case it was a quota error that slipped through
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    setIsRunning(false);
    setStatusMessage(abortRef.current ? "Fila parada." : "Processamento concluído!");
  };

  const stopQueue = () => {
    abortRef.current = true;
    setStatusMessage("Parando após o item atual...");
  };

  const updateItemStatus = (id: string, status: BatchItem['status']) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
  };

  // Handlers
  const handleRemove = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUpdateData = (id: string, field: keyof ExtractedData, value: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, data: { ...i.data, [field]: value } } : i));
  };

  const handleClearFinished = () => {
    setItems(prev => prev.filter(i => i.status !== 'success'));
  };

  const handleRetry = (id: string) => {
     setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'queued', errorMessage: undefined } : i));
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4 space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col gap-2">
         <div className="flex justify-between items-end">
            <div>
                <h1 className="text-2xl font-bold text-brand-primary dark:text-white">Upload em Massa</h1>
                <p className="text-sm text-gray-500">
                    Modo Sequencial • Máx {MAX_BATCH_SIZE} arq.
                </p>
            </div>
            <div className="text-right text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
                <div className="text-blue-600 font-bold">Fila: {queuedCount}</div>
                <div className="text-green-600">Sucesso: {successCount}</div>
                <div className="text-red-500">Erros: {errorCount}</div>
            </div>
         </div>

         {/* Status Banner */}
         {isRunning && (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-3 rounded-lg flex items-center gap-3 animate-pulse">
                <Clock className="text-blue-500 animate-spin-slow" />
                <span className="text-blue-800 dark:text-blue-200 font-mono text-sm font-bold">
                    {statusMessage}
                </span>
            </div>
         )}
      </div>

      {/* Empty State */}
      {items.length === 0 && (
        <div 
            onClick={() => !isRunning && fileInputRef.current?.click()}
            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-brand-dark/20 min-h-[300px] transition-colors ${isRunning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'}`}
        >
            <div className="bg-brand-primary/10 p-6 rounded-full mb-4">
                <UploadCloud className="w-12 h-12 text-brand-primary" />
            </div>
            <p className="text-lg font-medium text-gray-600 dark:text-gray-300">
                Toque para selecionar arquivos
            </p>
            <p className="text-sm text-gray-400 mt-2">
                Suporta Lotes Grandes (100+)
            </p>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
         {items.map(item => (
            <FileCard 
                key={item.id} 
                item={item} 
                onRemove={handleRemove}
                onUpdateData={handleUpdateData}
                onRetry={handleRetry}
                onZoom={setZoomUrl}
            />
         ))}
         
         <div className="h-80 w-full shrink-0" aria-hidden="true" />
      </div>

      {/* Actions Footer */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/90 dark:bg-brand-deep/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 z-10 flex gap-3 justify-center max-w-2xl mx-auto">
         <input 
            type="file" 
            multiple 
            accept="image/*,application/pdf" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
            disabled={isRunning}
         />
         
         {!isRunning && (
            <>
                {items.length < MAX_BATCH_SIZE && (
                    <Button 
                        variant="outline" 
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Plus className="mr-2" size={20} /> Adicionar
                    </Button>
                )}

                {queuedCount > 0 && (
                    <Button 
                        variant="primary" 
                        onClick={startQueue}
                        className="flex-1 max-w-[200px]"
                    >
                        <Play className="mr-2" size={20} />
                        Iniciar Fila ({queuedCount})
                    </Button>
                )}
                 {successCount > 0 && queuedCount === 0 && (
                    <Button variant="secondary" onClick={handleClearFinished}>
                        <CheckCircle className="mr-2" size={20} /> Limpar
                    </Button>
                )}
            </>
         )}

         {isRunning && (
            <Button 
                variant="secondary" 
                onClick={stopQueue}
                className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200"
            >
                <StopCircle className="mr-2" size={20} />
                Pausar Fila
            </Button>
         )}
      </div>

      <ImageZoomModal 
         isOpen={!!zoomUrl} 
         imageUrl={zoomUrl || ''} 
         onClose={() => setZoomUrl(null)} 
      />
    </div>
  );
};