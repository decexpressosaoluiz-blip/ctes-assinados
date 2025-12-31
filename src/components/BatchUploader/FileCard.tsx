import React from 'react';
import { X, AlertCircle, CheckCircle, RotateCw, ZoomIn, Loader2, Edit2 } from 'lucide-react';
import { BatchItem } from '../../types';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface FileCardProps {
  item: BatchItem;
  onRemove: (id: string) => void;
  onUpdateData: (id: string, field: keyof BatchItem['data'], value: string) => void;
  onRetry: (id: string) => void;
  onZoom: (url: string) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ item, onRemove, onUpdateData, onRetry, onZoom }) => {
  const isProcessing = item.status === 'processing_image' || item.status === 'analyzing_ai';
  const isUploading = item.status === 'uploading' || item.status === 'queued';
  const isError = item.status === 'error';
  const isSuccess = item.status === 'success';

  return (
    <div className={`relative bg-white dark:bg-brand-dark/40 rounded-xl border transition-all duration-300 overflow-hidden ${
      isError ? 'border-red-500 shadow-red-100 dark:shadow-none' : 
      isSuccess ? 'border-green-500' : 
      isUploading ? 'border-brand-primary shadow-lg' : 
      'border-gray-200 dark:border-gray-700'
    }`}>
      
      {/* Progress Overlay */}
      {item.status === 'uploading' && (
         <div className="absolute top-0 left-0 h-1 bg-brand-primary transition-all duration-300 z-10" style={{ width: '100%' }}>
            <div className="absolute top-0 right-0 bottom-0 left-0 bg-white/30 animate-pulse"></div>
         </div>
      )}

      <div className="p-3 flex gap-4">
        {/* Thumbnail Section */}
        <div className="relative w-24 h-32 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group">
          {item.previewUrl ? (
            <>
              <img 
                src={item.previewUrl} 
                alt="Doc" 
                className={`w-full h-full object-cover transition-opacity ${isProcessing ? 'opacity-50' : 'opacity-100'}`} 
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

          {/* Status Icons over Thumbnail */}
          <div className="absolute top-1 right-1">
             {isSuccess && <div className="bg-green-500 text-white p-1 rounded-full"><CheckCircle size={12} /></div>}
             {isError && <div className="bg-red-500 text-white p-1 rounded-full"><AlertCircle size={12} /></div>}
          </div>
        </div>

        {/* Inputs Section */}
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex justify-between items-start">
             <div>
                <h4 className="text-sm font-medium text-gray-500 truncate max-w-[150px]">{item.file.name}</h4>
                {isProcessing && <span className="text-xs text-brand-primary flex items-center gap-1"><Loader2 size={10} className="animate-spin"/> Otimizando & IA...</span>}
                {isError && <span className="text-xs text-red-500 font-medium">{item.errorMessage || "Erro no envio"}</span>}
                {isSuccess && <span className="text-xs text-green-600 font-medium">Enviado com sucesso!</span>}
             </div>
             
             {!isUploading && !isSuccess && (
               <button onClick={() => onRemove(item.id)} className="text-gray-400 hover:text-red-500 p-1">
                 <X size={16} />
               </button>
             )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 sm:col-span-1">
                <input
                  type="tel"
                  placeholder="Número"
                  value={item.data.numeroDoc}
                  onChange={(e) => onUpdateData(item.id, 'numeroDoc', e.target.value)}
                  disabled={isUploading || isSuccess}
                  className="w-full text-lg font-bold text-brand-primary bg-transparent border-b border-gray-200 focus:border-brand-primary focus:outline-none placeholder-gray-300 pb-1"
                />
            </div>
             <div className="col-span-2 sm:col-span-1">
                <input
                  type="text"
                  placeholder="Série"
                  value={item.data.serie}
                  onChange={(e) => onUpdateData(item.id, 'serie', e.target.value)}
                  disabled={isUploading || isSuccess}
                  className="w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent border-b border-gray-200 focus:border-brand-primary focus:outline-none placeholder-gray-300 pb-1"
                />
            </div>
            <div className="col-span-2">
                 <input
                  type="text"
                  placeholder="DD/MM/AAAA"
                  value={item.data.dataEmissao}
                  onChange={(e) => onUpdateData(item.id, 'dataEmissao', e.target.value)}
                  disabled={isUploading || isSuccess}
                  className="w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent border-b border-gray-200 focus:border-brand-primary focus:outline-none placeholder-gray-300 pb-1"
                />
            </div>
          </div>

          {isError && (
            <Button 
                variant="outline" 
                onClick={() => onRetry(item.id)} 
                className="h-8 text-xs w-full mt-2 border-red-200 text-red-600 hover:bg-red-50"
            >
                <RotateCw size={12} className="mr-1" /> Tentar Novamente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
