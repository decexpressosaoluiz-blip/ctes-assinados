import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Plus, Trash2, AlertTriangle, CheckCircle, Play, FileInput } from 'lucide-react';
import { processImage } from '../../lib/imageProcessor';
import { extractDataFromImage, uploadToDrive } from '../../services/api';
import { BatchItem, ExtractedData } from '../../types';
import { FileCard } from './FileCard';
import { ImageZoomModal } from './ImageZoomModal';
import { Button } from '../ui/Button';

const MAX_BATCH_SIZE = 10;
const CONCURRENCY_LIMIT = 2;

export const BatchManager: React.FC = () => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats
  const successCount = items.filter(i => i.status === 'success').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const isAllDone = items.length > 0 && items.every(i => i.status === 'success' || i.status === 'error');

  // 1. Handle File Selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const filesArray: File[] = Array.from(e.target.files);
    
    // Constraint: Hard Limit
    if (items.length + filesArray.length > MAX_BATCH_SIZE) {
      alert(`Limite de ${MAX_BATCH_SIZE} arquivos por vez. Selecione menos arquivos.`);
      return;
    }

    const newItems: BatchItem[] = filesArray.map(file => ({
      id: crypto.randomUUID(),
      file,
      data: { numeroDoc: '', serie: '', dataEmissao: '' },
      status: 'processing_image'
    }));

    setItems(prev => [...prev, ...newItems]);
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Trigger Processing for new items
    processNewItems(newItems);
  };

  // 2. Process Images (Resize -> AI)
  const processNewItems = async (newItems: BatchItem[]) => {
    for (const item of newItems) {
      try {
        // Step A: Client-side Image Processing (Resize/Compress)
        const processed = await processImage(item.file);
        
        setItems(prev => prev.map(i => i.id === item.id ? { 
            ...i, 
            previewUrl: processed.previewUrl, 
            base64: processed.base64,
            status: 'analyzing_ai'
        } : i));

        // Step B: AI Extraction (One by one to save resources, but non-blocking for UI)
        // We run this async without awaiting the whole loop to block
        extractAI(item.id, processed.base64);

      } catch (err) {
        console.error(err);
        setItems(prev => prev.map(i => i.id === item.id ? { 
            ...i, 
            status: 'error', 
            errorMessage: 'Erro ao processar imagem' 
        } : i));
      }
    }
  };

  const extractAI = async (id: string, base64: string) => {
    try {
        const extracted = await extractDataFromImage(base64);
        setItems(prev => prev.map(i => i.id === id ? {
            ...i,
            data: extracted,
            status: 'ready'
        } : i));
    } catch (err) {
        // Fallback: Just mark as ready for manual entry
        setItems(prev => prev.map(i => i.id === id ? {
            ...i,
            status: 'ready',
            errorMessage: 'IA falhou, digite manualmente'
        } : i));
    }
  };

  // 3. Batch Upload Logic (The Queue)
  useEffect(() => {
    if (!isProcessingQueue) return;

    const activeUploads = items.filter(i => i.status === 'uploading').length;
    const pendingItems = items.filter(i => i.status === 'queued');

    if (activeUploads < CONCURRENCY_LIMIT && pendingItems.length > 0) {
        const nextItem = pendingItems[0];
        triggerUpload(nextItem);
    } else if (activeUploads === 0 && pendingItems.length === 0) {
        setIsProcessingQueue(false); // Finished queue cycle
    }
  }, [items, isProcessingQueue]);

  const startBatchUpload = () => {
    // Mark all ready/error items as queued to retry/start
    setItems(prev => prev.map(i => 
        (i.status === 'ready' || i.status === 'error') ? { ...i, status: 'queued', errorMessage: undefined } : i
    ));
    setIsProcessingQueue(true);
  };

  const triggerUpload = async (item: BatchItem) => {
    // Optimistic Update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i));

    try {
        if (!item.base64) throw new Error("Imagem não processada");
        
        // Validate
        if (!item.data.numeroDoc) throw new Error("Número do documento obrigatório");

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
            imagemBase64: item.base64
        });

        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'success' } : i));

    } catch (err: any) {
        setItems(prev => prev.map(i => i.id === item.id ? { 
            ...i, 
            status: 'error', 
            errorMessage: err.message || "Erro desconhecido" 
        } : i));
    }
  };

  // Handlers
  const handleUpdateData = (id: string, field: keyof ExtractedData, value: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, data: { ...i.data, [field]: value } } : i));
  };

  const handleRemove = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleRetry = (id: string) => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'queued', errorMessage: undefined } : i));
      setIsProcessingQueue(true);
  };

  const handleClearFinished = () => {
      setItems(prev => prev.filter(i => i.status !== 'success'));
  };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-4 space-y-6 pb-24">
      {/* Header & Stats */}
      <div className="flex justify-between items-end">
         <div>
            <h1 className="text-2xl font-bold text-brand-primary dark:text-white">Lote de Upload</h1>
            <p className="text-sm text-gray-500">
               {items.length === 0 ? 'Adicione até 10 documentos' : `${items.length} documento(s) na lista`}
            </p>
         </div>
         {items.length > 0 && (
            <div className="text-right text-xs font-mono">
                <div className="text-green-600">Sucesso: {successCount}</div>
                <div className="text-red-500">Erros: {errorCount}</div>
            </div>
         )}
      </div>

      {/* Empty State */}
      {items.length === 0 && (
        <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-brand-dark/20 min-h-[300px] cursor-pointer hover:bg-gray-100 transition-colors"
        >
            <div className="bg-brand-primary/10 p-6 rounded-full mb-4">
                <UploadCloud className="w-12 h-12 text-brand-primary" />
            </div>
            <p className="text-lg font-medium text-gray-600 dark:text-gray-300">Toque para selecionar arquivos</p>
            <p className="text-sm text-gray-400 mt-2">Máximo 10 por vez</p>
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
      </div>

      {/* Actions Footer */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/90 dark:bg-brand-deep/90 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 z-10 flex gap-3 justify-center max-w-2xl mx-auto">
         <input 
            type="file" 
            multiple 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
         />
         
         {items.length < MAX_BATCH_SIZE && !isProcessingQueue && (
             <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Plus className="mr-2" size={20} /> Adicionar
             </Button>
         )}

         {items.length > 0 && !isAllDone && (
             <Button 
                variant="primary" 
                onClick={startBatchUpload} 
                isLoading={isProcessingQueue}
                disabled={isProcessingQueue || items.filter(i => i.status === 'ready' || i.status === 'error').length === 0}
                className="flex-1 max-w-[200px]"
             >
                <UploadCloud className="mr-2" size={20} />
                {isProcessingQueue ? 'Enviando...' : 'Enviar Tudo'}
             </Button>
         )}

         {isAllDone && (
            <Button variant="secondary" onClick={handleClearFinished}>
                <CheckCircle className="mr-2" size={20} /> Limpar Concluídos
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