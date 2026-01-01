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
  const [zoomState, setZoomState] = useState<{url: string, rotation: number} | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<boolean>(false);
  
  // CRITICAL FIX: Keep a ref of items to access fresh state inside async loops
  const itemsRef = useRef<BatchItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // --- BACKGROUND PDF PREVIEW GENERATOR ---
  useEffect(() => {
    const generateNextPreview = async () => {
        // Find the first PDF that has NO previewUrl and is NOT currently being processed by this effect (implicitly)
        const itemNeedsPreview = items.find(i => !i.previewUrl && i.file.type === 'application/pdf');

        if (itemNeedsPreview) {
            try {
                // console.log("Generating preview for PDF:", itemNeedsPreview.file.name);
                const jpegFile = await convertPdfToJpeg(itemNeedsPreview.file);
                const previewUrl = URL.createObjectURL(jpegFile);

                setItems(prev => prev.map(i => i.id === itemNeedsPreview.id ? { ...i, previewUrl } : i));
            } catch (err) {
                console.error("Failed to generate preview for", itemNeedsPreview.file.name, err);
                // Mark as failed preview so we don't loop forever
                setItems(prev => prev.map(i => i.id === itemNeedsPreview.id ? { ...i, previewUrl: 'error' } : i));
            }
        }
    };
    
    // Small timeout to not block UI thread immediately
    const timer = setTimeout(generateNextPreview, 100);
    return () => clearTimeout(timer);
  }, [items]);


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

  // Clean up ObjectURLs ONLY on unmount to prevent premature revocation causing broken images
  useEffect(() => {
    return () => {
      itemsRef.current.forEach(item => {
        if (item.previewUrl && item.previewUrl.startsWith('blob:') && item.previewUrl !== 'error') {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  // 1. Lazy File Selection (Low Memory Usage + Instant Preview)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const filesArray: File[] = Array.from(e.target.files);
    
    if (items.length + filesArray.length > MAX_BATCH_SIZE) {
      alert(`Limite de segurança: ${MAX_BATCH_SIZE} arquivos por lote.`);
      return;
    }

    const newItems: BatchItem[] = filesArray.map(file => {
      // INSTANT PREVIEW for Images
      let instantPreview = undefined;
      if (file.type.startsWith('image/')) {
        instantPreview = URL.createObjectURL(file);
      }
      // For PDFs, we leave undefined. The useEffect above will catch it.

      return {
        id: crypto.randomUUID(),
        file,
        previewUrl: instantPreview, 
        // AUTO-ROTATION: Start at 270 (90 deg counter-clockwise)
        rotation: 270,
        data: { numeroDoc: '', serie: '', dataEmissao: '' },
        status: 'queued'
      };
    });

    setItems(prev => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // AUTO START QUEUE IF NOT RUNNING
    // Use a small timeout to let state settle/refs update via useEffect
    setTimeout(() => {
        if (!abortRef.current && !isRunning) {
            startQueue();
        }
    }, 500);
  };

  // 2. The Robust Sequential Loop
  const startQueue = async () => {
    // If already running, do nothing (prevent double clicks)
    // Note: We access the STATE isRunning here, but inside loop we check abortRef too
    if (isRunning) return;
    
    setIsRunning(true);
    abortRef.current = false;
    setStatusMessage("Iniciando fila de processamento...");

    // Get IDs to process (snapshot at start)
    // We re-read itemsRef here because this function might be called via setTimeout
    const queueIds = itemsRef.current
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
        
        // CRITICAL FIX: Read from REF to get the absolute latest state (including manual typing)
        const currentItem = itemsRef.current.find(item => item.id === id);

        if (!currentItem) {
            console.warn("Item not found in ref, skipping:", id);
            continue;
        }

        try {
            setStatusMessage(`Processando item ${i + 1}/${total}: Otimizando imagem...`);
            updateItemStatus(id, 'processing_image');
            
            // --- STEP A: PREPARE IMAGE ---
            let fileToProcess = currentItem.file;
            
            if (fileToProcess.type === 'application/pdf') {
                try {
                    fileToProcess = await convertPdfToJpeg(fileToProcess);
                } catch (pdfErr) {
                    throw new Error("Falha ao converter PDF.");
                }
            }

            // Resize/Compress + ROTATE based on user selection
            const processed = await processImage(fileToProcess, currentItem.rotation || 0);
            
            // Cleanup previous blob if exists before overwriting with Data URL
            if (currentItem.previewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(currentItem.previewUrl);
            }

            // Save base64 to state
            setItems(prev => prev.map(item => item.id === id ? {
                ...item,
                base64: processed.base64,
                // We update preview URL here to the "processed" one (which is rotated/cropped)
                // This gives feedback that processing worked
                previewUrl: processed.previewUrl, 
                // Reset rotation to 0 visually because the image itself is now rotated
                rotation: 0 
            } : item));

            // --- STEP B: CHECK FOR MANUAL OVERRIDE (QUOTA FALLBACK) ---
            // Use currentItem from REF to ensure we see what user typed 1ms ago
            // NOW MANDATORY: Numero, Serie, AND Data must be present.
            const isManualDataFilled = currentItem.data.numeroDoc && currentItem.data.dataEmissao && currentItem.data.serie;
            
            let extractedData = currentItem.data;
            let needsReview = false;

            if (!isManualDataFilled) {
                // Normal Flow: Use AI
                setStatusMessage(`Processando item ${i + 1}/${total}: Analisando com IA...`);
                updateItemStatus(id, 'analyzing_ai');

                extractedData = await extractDataFromImage(processed.base64);

                // Update state with AI result
                setItems(prev => prev.map(item => item.id === id ? {
                    ...item,
                    data: extractedData
                } : item));

                // CHECK CONFIDENCE
                // If AI flagged as needsReview OR if critical fields are empty
                if (extractedData.needsReview || !extractedData.numeroDoc || !extractedData.serie || !extractedData.dataEmissao) {
                    needsReview = true;
                }

            } else {
                // Fallback Flow: Skip AI
                setStatusMessage(`Item ${i + 1}/${total}: Dados manuais detectados (Sem IA). Preparando...`);
                await new Promise(r => setTimeout(r, 400));
            }

            // --- STEP B.5: PAUSE FOR REVIEW IF NEEDED ---
            if (needsReview) {
                setStatusMessage(`Item ${i + 1}/${total}: Revisão necessária. Aguardando usuário.`);
                // Set status to 'ready' (Waiting for Confirmation)
                // Set error message as a "Warning"
                setItems(prev => prev.map(item => item.id === id ? {
                    ...item,
                    status: 'ready',
                    errorMessage: "Confirme os dados antes do envio.",
                    // Do NOT clear base64 yet, user might need it if we re-implement re-upload logic, 
                    // though for now we are just confirming data.
                } : item));
                
                // Continue the loop to process other items, effectively skipping upload for this one
                continue; 
            }

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
                errorMessage: undefined
            } : item));

            processedCount++;

            // --- STEP E: SAFETY BRAKE ---
            const waitTime = isManualDataFilled ? 2 : 15; 
            
            if (i < total - 1) { 
                for (let s = waitTime; s > 0; s--) {
                    if (abortRef.current) break;
                    setStatusMessage(`Sucesso! Aguardando ${s}s...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

        } catch (err: any) {
            console.error(`Error processing item ${id}:`, err);
            
            const errorMessage = err.message || "Erro desconhecido";
            const isQuotaError = errorMessage.toLowerCase().includes("cota") || errorMessage.toLowerCase().includes("quota");

            setItems(prev => prev.map(item => item.id === id ? {
                ...item,
                status: 'error',
                errorMessage: isQuotaError ? "Cota Excedida. Preencha Manualmente." : errorMessage,
                base64: undefined // Clear RAM
            } : item));
            
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
    setItems(prev => {
        const itemToRemove = prev.find(i => i.id === id);
        if (itemToRemove?.previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(itemToRemove.previewUrl);
        }
        return prev.filter(i => i.id !== id);
    });
  };

  const handleUpdateData = (id: string, field: keyof ExtractedData, value: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, data: { ...i.data, [field]: value } } : i));
  };

  const handleRotate = (id: string) => {
      setItems(prev => prev.map(i => {
          if (i.id !== id) return i;
          const currentRot = i.rotation || 0;
          // Counter-Clockwise Logic: Add 270 degrees (equiv to -90)
          // 0 -> 270, 270 -> 180, 180 -> 90, 90 -> 0
          const newRot = (currentRot + 270) % 360;
          return { ...i, rotation: newRot };
      }));
  };

  // NEW: Handle Manual Confirmation/Upload
  const handleConfirmUpload = async (id: string) => {
     // Get fresh item data
     const item = itemsRef.current.find(i => i.id === id);
     if (!item) return;

     // Simple validation
     if (!item.data.numeroDoc || !item.data.dataEmissao || !item.data.serie) {
         alert("Preencha todos os campos antes de confirmar.");
         return;
     }

     updateItemStatus(id, 'uploading');

     try {
         const [dia, mes, ano] = item.data.dataEmissao.includes('/') 
                ? item.data.dataEmissao.split('/') 
                : ['', '', ''];

         await uploadToDrive({
                ano: ano || '2025',
                mes: mes || '01',
                dia: dia || '01',
                serie: item.data.serie || 'N/A',
                numeroDoc: item.data.numeroDoc,
                mimeType: 'image/jpeg',
                // If base64 is gone (cleaned up), we might need to re-process (unlikely in 'ready' state logic above)
                // But if it is missing, we can't upload. Logic above keeps base64 for 'ready' items.
                imagemBase64: item.base64 || '' 
         });

         setItems(prev => prev.map(i => i.id === id ? {
             ...i,
             status: 'success',
             base64: undefined,
             errorMessage: undefined,
             data: { ...i.data, needsReview: false } // Clear flag
         } : i));

     } catch (err: any) {
         setItems(prev => prev.map(i => i.id === id ? {
             ...i,
             status: 'error',
             errorMessage: err.message || "Erro ao enviar.",
             // Keep base64 so they can retry
         } : i));
     }
  };

  const handleClearFinished = () => {
    setItems(prev => {
        const kept = prev.filter(i => i.status !== 'success');
        const removed = prev.filter(i => i.status === 'success');
        
        // Technically success items might have previewUrls if we kept them, but usually we clear base64.
        // If previewUrl is blob, revoke it.
        removed.forEach(item => {
             if (item.previewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(item.previewUrl);
             }
        });
        return kept;
    });
  };

  const handleClearQueue = () => {
    // Instant clear of pending/error items without confirmation dialog
    setItems(prev => {
        const kept = prev.filter(i => i.status === 'success');
        const removed = prev.filter(i => i.status !== 'success');
        
        removed.forEach(item => {
             if (item.previewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(item.previewUrl);
             }
        });
        
        return kept;
    });
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
                onConfirm={handleConfirmUpload} // Pass confirmation handler
                onRotate={handleRotate}
                onZoom={(url) => setZoomState({ url, rotation: item.rotation || 0 })}
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
                {/* Trash Button - Only appears if there are queued or error items */}
                {(queuedCount > 0 || errorCount > 0) && (
                    <Button 
                        variant="ghost" 
                        onClick={handleClearQueue}
                        className="text-red-500 hover:bg-red-50 hover:text-red-700 border border-transparent hover:border-red-200 px-3 shrink-0"
                        title="Remover todos os pendentes e erros"
                    >
                        <Trash2 size={24} />
                    </Button>
                )}

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
         isOpen={!!zoomState} 
         imageUrl={zoomState?.url || ''} 
         rotation={zoomState?.rotation || 0}
         onClose={() => setZoomState(null)} 
      />
    </div>
  );
};