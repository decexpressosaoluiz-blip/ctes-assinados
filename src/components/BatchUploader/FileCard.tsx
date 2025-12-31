import React from 'react';
import { X, AlertCircle, CheckCircle, RotateCw, ZoomIn, Loader2, PlayCircle } from 'lucide-react';
import { BatchItem } from '../../types';
import { Button } from '../ui/Button';

interface FileCardProps {
  item: BatchItem;
  onRemove: (id: string) => void;
  onUpdateData: (id: string, field: keyof BatchItem['data'], value: string) => void;
  onRetry: (id: string) => void;
  onZoom: (url: string) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ item, onRemove, onUpdateData, onRetry, onZoom }) => {
  // 1. Determine State
  const isProcessingOrQueued = 
    item.status === 'processing_image' || 
    item.status === 'analyzing_ai' || 
    item.status === 'queued' || 
    item.status === 'uploading';
    
  const isSuccess = item.status === 'success';
  const isError = item.status === 'error';
  
  // 2. Data Validation for "Red" state warning
  // Flag as warning if:
  // - Status is 'ready' AND fields are empty
  // - OR Number is suspiciously short (less than 3 digits usually indicates read error for CTEs)
  const isDataIncomplete = !item.data.numeroDoc || !item.data.dataEmissao;
  const isSuspiciousRead = item.data.numeroDoc.length > 0 && item.data.numeroDoc.length < 3;
  const isAIWarning = item.status === 'ready' && (isDataIncomplete || isSuspiciousRead);

  const isProblematic = isError || isAIWarning;
  
  // New Logic: "Ready" state is also Green if it's not problematic
  const isReadyAndValid = item.status === 'ready' && !isProblematic;
  const isGreenState = isSuccess || isReadyAndValid;

  // 3. Dynamic Styles (Background & Border)
  // We explicitly handle bg-white here so colored states override it completely
  let cardStyleClass = 'bg-white dark:bg-brand-dark/40 border-gray-200 dark:border-gray-700 border'; // Default

  if (isProblematic) {
    // RED: Errors or AI Warnings take priority
    cardStyleClass = 'bg-red-50 dark:bg-red-900/20 border-red-500 border-2';
  } else if (isProcessingOrQueued) {
    // YELLOW: Processing, Queue, Uploading
    cardStyleClass = 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 border-2';
  } else if (isGreenState) {
    // GREEN: Success OR Ready (Good to Go)
    cardStyleClass = 'bg-green-50 dark:bg-green-900/20 border-green-500 border-2';
  }

  return (
    <div className={`relative rounded-xl transition-all duration-300 overflow-hidden shadow-sm ${cardStyleClass}`}>
      
      {/* Progress Bar Animation for Uploading */}
      {item.status === 'uploading' && (
         <div className="absolute top-0 left-0 h-1 bg-yellow-500 transition-all duration-300 z-10 w-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full w-full bg-white/50 animate-indeterminate-bar"></div>
         </div>
      )}

      <div className="p-3 flex gap-4">
        {/* Thumbnail Section */}
        <div className="relative w-24 h-32 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group border border-gray-200 dark:border-gray-600">
          {item.previewUrl ? (
            <>
              <img 
                src={item.previewUrl} 
                alt="Doc" 
                className={`w-full h-full object-cover transition-opacity ${isProcessingOrQueued ? 'opacity-70' : 'opacity-100'}`} 
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                 <button onClick={() => onZoom(item.previewUrl!)} className="text-white p-2 hover:scale-110 transition-transform">
                    <ZoomIn size={20} />
                 </button>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-gray-400" />
            </div>
          )}

          {/* Status Badge Overlays */}
          <div className="absolute top-1 right-1 z-20">
             {isSuccess && <div className="bg-green-500 text-white p-1 rounded-full shadow-md"><CheckCircle size={14} /></div>}
             {isReadyAndValid && <div className="bg-green-500 text-white p-1 rounded-full shadow-md"><PlayCircle size={14} /></div>}
             {isProblematic && <div className="bg-red-500 text-white p-1 rounded-full shadow-md"><AlertCircle size={14} /></div>}
             {isProcessingOrQueued && !isSuccess && (
                <div className="bg-yellow-500 text-white p-1 rounded-full shadow-md">
                    <Loader2 size={14} className="animate-spin"/>
                </div>
             )}
          </div>
        </div>

        {/* Form Inputs Section */}
        <div className="flex-1 space-y-2 min-w-0">
          
          {/* Header Row: Filename & Remove Button */}
          <div className="flex justify-between items-start">
             <div className="flex flex-col">
                <h4 className="text-xs font-mono text-gray-500 truncate max-w-[140px] mb-1">{item.file.name}</h4>
                
                {/* Text Status Feedback */}
                {isProcessingOrQueued && <span className="text-xs text-yellow-700 dark:text-yellow-400 font-bold">Processando...</span>}
                {isError && <span className="text-xs text-red-600 font-bold">{item.errorMessage || "Erro no envio"}</span>}
                {isAIWarning && <span className="text-xs text-red-600 font-bold">Verifique os dados!</span>}
                {isSuccess && <span className="text-xs text-green-700 font-bold">Enviado com Sucesso!</span>}
                {isReadyAndValid && <span className="text-xs text-green-700 font-bold">Pronto para Enviar</span>}
             </div>
             
             {!item.status.includes('uploading') && !isSuccess && (
               <button onClick={() => onRemove(item.id)} className="text-gray-400 hover:text-red-500 p-1 -mt-1 -mr-1">
                 <X size={18} />
               </button>
             )}
          </div>

          {/* Inputs Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Numero Input */}
            <div className="col-span-2 sm:col-span-1">
                <input
                  type="tel"
                  placeholder="Número"
                  value={item.data.numeroDoc}
                  onChange={(e) => onUpdateData(item.id, 'numeroDoc', e.target.value)}
                  disabled={isSuccess || item.status === 'uploading'}
                  className={`w-full text-lg font-bold bg-transparent border-b focus:outline-none placeholder-gray-400 pb-1 transition-colors
                     ${isProblematic && !item.data.numeroDoc 
                        ? 'border-red-400 text-red-700 placeholder-red-300' 
                        : 'border-gray-300 text-brand-primary focus:border-brand-primary'}
                  `}
                />
            </div>
            
            {/* Serie Input */}
             <div className="col-span-2 sm:col-span-1">
                <input
                  type="text"
                  placeholder="Série"
                  value={item.data.serie}
                  onChange={(e) => onUpdateData(item.id, 'serie', e.target.value)}
                  disabled={isSuccess || item.status === 'uploading'}
                  className="w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent border-b border-gray-300 focus:border-brand-primary focus:outline-none placeholder-gray-400 pb-1"
                />
            </div>

            {/* Date Input */}
            <div className="col-span-2">
                 <input
                  type="text"
                  placeholder="DD/MM/AAAA"
                  value={item.data.dataEmissao}
                  onChange={(e) => onUpdateData(item.id, 'dataEmissao', e.target.value)}
                  disabled={isSuccess || item.status === 'uploading'}
                  className={`w-full text-sm bg-transparent border-b focus:outline-none placeholder-gray-400 pb-1 transition-colors
                      ${isProblematic && !item.data.dataEmissao 
                        ? 'border-red-400 text-red-700 placeholder-red-300' 
                        : 'border-gray-300 text-gray-700 dark:text-gray-300 focus:border-brand-primary'}
                  `}
                />
            </div>
          </div>

          {/* Retry Button */}
          {isError && (
            <Button 
                variant="outline" 
                onClick={() => onRetry(item.id)} 
                className="h-8 text-xs w-full mt-2 border-red-300 text-red-700 hover:bg-red-100 bg-white/50"
            >
                <RotateCw size={12} className="mr-1" /> Tentar Novamente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};