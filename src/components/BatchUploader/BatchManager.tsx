import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UploadCloud, Plus, Trash2, AlertTriangle, CheckCircle, Play, FileInput, StopCircle, Clock, Upload, ScanEye } from 'lucide-react';
import { processImage } from '../../lib/imageProcessor';
import { extractDataFromImage, uploadToDrive } from '../../services/api';
import { BatchItem, ExtractedData } from '../../types';
import { FileCard } from './FileCard';
import { ImageZoomModal } from './ImageZoomModal';
import { Button } from '../ui/Button';
import { convertPdfToJpeg } from '../../utils/pdfConverter';

const MAX_BATCH_SIZE = 150; 
const AI_DELAY_MS = 2000; // Delay to respect Free Tier limits (approx 30 req/min safety)

export const BatchManager: React.FC = () => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [zoomState, setZoomState] = useState<{url: string, rotation: number} | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<boolean>(false);
  const itemsRef = useRef<BatchItem[]>([]);

  // Sync Ref
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // --- STATS ---
  const successCount = items.filter(i => i.status === 'success').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const queuedCount = items.filter(i => i.status === 'queued').length;
  const readyCount = items.filter(i => i.status === 'ready').length; // Analyzed, waiting upload
  const isBusy = isAnalyzing || isUploading;

  // --- BACKGROUND PDF PREVIEW GENERATOR ---
  useEffect(() => {
    const generateNextPreview = async () => {
        const itemNeedsPreview = items.find(i => !i.previewUrl && i.file.type === 'application/pdf');
        if (itemNeedsPreview) {
            try {
                const jpegFile = await convertPdfToJpeg(itemNeedsPreview.file);
                const previewUrl = URL.createObjectURL(jpegFile);
                setItems(prev => prev.map(i => i.id === itemNeedsPreview.id ? { ...i, previewUrl } : i));
            } catch (err) {
                console.error("Failed to generate preview", err);
                setItems(prev => prev.map(i => i.id === itemNeedsPreview.id ? { ...i, previewUrl: 'error' } : i));
            }
        }
    };
    const timer = setTimeout(generateNextPreview, 100);
    return () => clearTimeout(timer);
  }, [items]);

  // Prevent closing tab
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isBusy) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isBusy]);

  // Cleanup
  useEffect(() => {
    return () => {
      itemsRef.current.forEach(item => {
        if (item.previewUrl?.startsWith('blob:') && item.previewUrl !== 'error') {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray: File[] = Array.from(e.target.files);
    
    if (items.length + filesArray.length > MAX_BATCH_SIZE) {
      alert(`Limite de segurança: ${MAX_BATCH_SIZE} arquivos por lote.`);
      return;
    }

    const newItems: BatchItem[] = filesArray.map(file => {
      let instantPreview = undefined;
      if (file.type.startsWith('image/')) {
        instantPreview = URL.createObjectURL(file);
      }
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl: instantPreview, 
        rotation: 270, // Default rotation
        data: { numeroDoc: '', serie: '', dataEmissao: '' },
        status: 'queued'
      };
    });

    setItems(prev => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    // Auto-start analysis if not busy
    setTimeout(() => {
        if (!abortRef.current && !isBusy) {
            startAnalysisQueue();
        }
    }, 500);
  };

  // --- CORE: ANALYSIS QUEUE (Image -> AI -> Ready) ---
  const startAnalysisQueue = async () => {
    if (isBusy) return;
    
    setIsAnalyzing(true);
    abortRef.current = false;
    setStatusMessage("Iniciando análise...");

    // Get items that need processing (Queued or Error)
    const queueIds = itemsRef.current
        .filter(i => i.status === 'queued' || i.status === 'error')
        .map(i => i.id);

    const total = queueIds.length;

    for (let i = 0; i < total; i++) {
        if (abortRef.current) {
            setStatusMessage("Análise pausada.");
            break;
        }

        const id = queueIds[i];
        
        // Check Status (User might have paused SPECIFIC item mid-loop)
        const currentItem = itemsRef.current.find(item => item.id === id);
        if (!currentItem || currentItem.status === 'paused') {
            continue;
        }

        try {
            // 1. Otimização de Imagem
            setStatusMessage(`Item ${i + 1}/${total}: Otimizando imagem...`);
            updateItemStatus(id, 'processing_image');
            
            let fileToProcess = currentItem.file;
            if (fileToProcess.type === 'application/pdf') {
                try {
                    fileToProcess = await convertPdfToJpeg(fileToProcess);
                } catch (e) { throw new Error("Erro conv. PDF"); }
            }

            const processed = await processImage(fileToProcess, currentItem.rotation || 0);
            
            // Revoke old blob to save memory
            if (currentItem.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(currentItem.previewUrl);

            // Update State with Processed Image
            setItems(prev => prev.map(item => item.id === id ? {
                ...item,
                base64: processed.base64,
                previewUrl: processed.previewUrl,
                rotation: 0 // Reset visual rotation since image is baked
            } : item));

            // --- PAUSE CHECK POINT ---
            // Check if user paused THIS item while image was processing
            const freshItem = itemsRef.current.find(x => x.id === id);
            if (freshItem?.status === 'paused' || abortRef.current) {
                 updateItemStatus(id, 'paused'); // Ensure it stays paused
                 continue;
            }

            // 2. AI Analysis
            const isManualDataFilled = currentItem.data.numeroDoc && currentItem.data.dataEmissao && currentItem.data.serie;
            let extractedData = currentItem.data;

            if (!isManualDataFilled) {
                setStatusMessage(`Item ${i + 1}/${total}: Lendo com IA...`);
                updateItemStatus(id, 'analyzing_ai');

                // Artificial Delay for Rate Limiting
                if (i > 0) await new Promise(r => setTimeout(r, AI_DELAY_MS));

                extractedData = await extractDataFromImage(processed.base64);
            }

            // 3. Mark as READY (Orange) - DO NOT UPLOAD YET
            setItems(prev => prev.map(item => item.id === id ? {
                ...item,
                status: 'ready', // Orange State
                data: extractedData,
                errorMessage: undefined
            } : item));

        } catch (err: any) {
            console.error(`Error analyzing item ${id}:`, err);
            setItems(prev => prev.map(item => item.id === id ? {
                ...item,
                status: 'error',
                errorMessage: err.message || "Erro na análise",
            } : item));
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    setIsAnalyzing(false);
    setStatusMessage("Análise concluída. Verifique os dados.");
  };

  // --- CORE: UPLOAD QUEUE (Ready -> Cloud) ---
  const handleUploadAllReady = async () => {
      if (isBusy) return;
      
      setIsUploading(true);
      abortRef.current = false;
      
      const readyIds = itemsRef.current
        .filter(i => i.status === 'ready')
        .map(i => i.id);
        
      const total = readyIds.length;
      if (total === 0) {
          setIsUploading(false);
          return;
      }

      for (let i = 0; i < total; i++) {
          if (abortRef.current) break;
          
          const id = readyIds[i];
          const item = itemsRef.current.find(x => x.id === id);
          if (!item || item.status === 'paused') continue;

          try {
              setStatusMessage(`Enviando ${i + 1}/${total}: CTE ${item.data.numeroDoc}...`);
              updateItemStatus(id, 'uploading');

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
                imagemBase64: item.base64 || ''
              });

              setItems(prev => prev.map(x => x.id === id ? {
                  ...x,
                  status: 'success',
                  base64: undefined, // Clear RAM
                  errorMessage: undefined,
                  data: { ...x.data, needsReview: false }
              } : x));

          } catch (err: any) {
              setItems(prev => prev.map(x => x.id === id ? {
                  ...x,
                  status: 'ready', // Keep ready so they can try again
                  errorMessage: "Erro no envio. Tente novamente."
              } : x));
          }
      }
      
      setIsUploading(false);
      setStatusMessage("Envio finalizado.");
  };

  const stopQueue = () => {
    abortRef.current = true;
    setStatusMessage("Parando...");
  };

  const updateItemStatus = (id: string, status: BatchItem['status']) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
  };

  // --- INDIVIDUAL HANDLERS ---
  const handleRemove = (id: string) => {
    setItems(prev => {
        const item = prev.find(i => i.id === id);
        if (item?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        return prev.filter(i => i.id !== id);
    });
  };

  const handleUpdateData = (id: string, field: keyof ExtractedData, value: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, data: { ...i.data, [field]: value } } : i));
  };

  const handleRotate = (id: string) => {
      setItems(prev => prev.map(i => {
          if (i.id !== id) return i;
          const newRot = ((i.rotation || 0) + 270) % 360;
          return { ...i, rotation: newRot };
      }));
  };

  const handleTogglePause = (id: string) => {
     setItems(prev => prev.map(i => {
         if (i.id !== id) return i;
         
         // If currently processing, force it to 'paused' state immediately
         // The loop checks for this state between steps
         if (i.status === 'processing_image' || i.status === 'analyzing_ai') {
             return { ...i, status: 'paused' };
         }
         
         if (i.status === 'queued') return { ...i, status: 'paused' };
         if (i.status === 'paused') return { ...i, status: 'queued' };
         return i;
     }));
  };

  const handleSingleUpload = async (id: string) => {
     const item = itemsRef.current.find(i => i.id === id);
     if (!item) return;

     if (!item.data.numeroDoc || !item.data.dataEmissao || !item.data.serie) {
         alert("Preencha todos os campos.");
         return;
     }

     updateItemStatus(id, 'uploading');

     try {
         const [dia, mes, ano] = item.data.dataEmissao.split('/');
         await uploadToDrive({
                ano: ano || '2025', mes: mes || '01', dia: dia || '01',
                serie: item.data.serie || 'N/A',
                numeroDoc: item.data.numeroDoc,
                mimeType: 'image/jpeg',
                imagemBase64: item.base64 || '' 
         });
         setItems(prev => prev.map(i => i.id === id ? {
             ...i, status: 'success', base64: undefined, errorMessage: undefined
         } : i));
     } catch (err: any) {
         setItems(prev => prev.map(i => i.id === id ? {
             ...i, status: 'ready', errorMessage: "Erro ao enviar."
         } : i));
     }
  };

  const handleClearFinished = () => {
    setItems(prev => {
        const kept = prev.filter(i => i.status !== 'success');
        const removed = prev.filter(i => i.status === 'success');
        removed.forEach(item => {
             if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        });
        return kept;
    });
  };

  const handleClearQueue = () => {
    setItems(prev => {
        const kept = prev.filter(i => i.status === 'success' || i.status === 'ready');
        const removed = prev.filter(i => i.status !== 'success' && i.status !== 'ready');
        removed.forEach(item => {
             if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        });
        return kept;
    });
  };

  const handleRetry = (id: string) => {
     setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'queued', errorMessage: undefined } : i));
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4 space-y-6 pb-24">
      {/* Header & Stats */}
      <div className="flex flex-col gap-2">
         <div className="flex justify-between items-end">
            <div>
                <h1 className="text-2xl font-bold text-brand-primary dark:text-white">Upload em Massa</h1>
                <p className="text-sm text-gray-500">
                    Modo Seguro • Análise primeiro, Envio depois
                </p>
            </div>
            <div className="text-right text-xs font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded-lg grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="text-blue-600 font-bold">Fila: {queuedCount}</div>
                <div className="text-orange-600 font-bold">Analisados: {readyCount}</div>
                <div className="text-green-600">Sucesso: {successCount}</div>
                <div className="text-red-500">Erros: {errorCount}</div>
            </div>
         </div>

         {/* Status Banner */}
         {isBusy && (
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
            onClick={() => !isBusy && fileInputRef.current?.click()}
            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-brand-dark/20 min-h-[300px] transition-colors ${isBusy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'}`}
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
                onConfirm={handleSingleUpload} 
                onRotate={handleRotate}
                onTogglePause={handleTogglePause}
                onZoom={(url) => setZoomState({ url, rotation: item.rotation || 0 })}
            />
         ))}
      </div>

      {/* Actions Footer - STICKY */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/95 dark:bg-brand-deep/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 z-30 shadow-lg-up flex gap-3 justify-center max-w-2xl mx-auto">
         <input 
            type="file" 
            multiple 
            accept="image/*,application/pdf" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
            disabled={isBusy}
         />
         
         {!isBusy ? (
            <>
                {/* 1. Add / Remove */}
                {items.length < MAX_BATCH_SIZE && (
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="px-3">
                        <Plus size={20} />
                    </Button>
                )}
                
                {(queuedCount > 0 || errorCount > 0) && (
                    <Button variant="ghost" onClick={handleClearQueue} className="text-red-500 px-3">
                        <Trash2 size={24} />
                    </Button>
                )}

                {/* 2. Analyze Action */}
                {queuedCount > 0 && (
                    <Button 
                        variant="primary" 
                        onClick={startAnalysisQueue}
                        className="flex-1 bg-brand-primary hover:bg-brand-focus"
                    >
                        <ScanEye className="mr-2" size={20} />
                        Analisar ({queuedCount})
                    </Button>
                )}

                {/* 3. Upload Action (Only appears if items are Ready) */}
                {readyCount > 0 && (
                    <Button 
                        variant="primary" 
                        onClick={handleUploadAllReady}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white animate-in zoom-in"
                    >
                        <Upload className="mr-2" size={20} />
                        Enviar ({readyCount})
                    </Button>
                )}

                {/* 4. Cleanup */}
                {successCount > 0 && queuedCount === 0 && readyCount === 0 && (
                    <Button variant="secondary" onClick={handleClearFinished}>
                        <CheckCircle className="mr-2" size={20} /> Limpar
                    </Button>
                )}
            </>
         ) : (
            <Button 
                variant="secondary" 
                onClick={stopQueue}
                className="bg-red-100 text-red-700 hover:bg-red-200 w-full"
            >
                <StopCircle className="mr-2" size={20} />
                Pausar ({isAnalyzing ? 'Análise' : 'Envio'})
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