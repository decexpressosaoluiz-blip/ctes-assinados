import React from 'react';
import { X, AlertCircle, CheckCircle, RotateCw, ZoomIn, Loader2, PlayCircle, Clock, FileText, Brain, Upload, RotateCcw } from 'lucide-react';
import { BatchItem } from '../../types';
import { Button } from '../ui/Button';

interface FileCardProps {
  item: BatchItem;
  onRemove: (id: string) => void;
  onUpdateData: (id: string, field: keyof BatchItem['data'], value: string) => void;
  onRetry: (id: string) => void;
  onZoom: (url: string) => void;
  onRotate: (id: string) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ item, onRemove, onUpdateData, onRetry, onZoom, onRotate }) => {
  // 1. Determine State
  const isActiveProcessing = 
    item.status === 'processing_image' || 
    item.status === 'analyzing_ai' || 
    item.status === 'uploading';

  const isQueued = item.status === 'queued';
  const isSuccess = item.status === 'success';
  const isError = item.status === 'error';
  
  // Data Validation
  const isDataIncomplete = !item.data.numeroDoc || !item.data.dataEmissao;
  const isSuspiciousRead = item.data.numeroDoc.length > 0 && item.data.numeroDoc.length < 3;
  const isAIWarning = item.status === 'ready' && (isDataIncomplete || isSuspiciousRead);

  const isProblematic = isError || isAIWarning;
  const isReadyAndValid = item.status === 'ready' && !isProblematic;
  const isGreenState = isSuccess || isReadyAndValid;

  // 3. Dynamic Styles
  let cardStyleClass = 'bg-white dark:bg-brand-dark/40 border-gray-200 dark:border-gray-700 border'; // Default

  if (isProblematic) {
    cardStyleClass = 'bg-red-50 dark:bg-red-900/20 border-red-500 border-2';
  } else if (isActiveProcessing) {
    cardStyleClass = 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 border-2 shadow-md scale-[1.01] z-10';
  } else if (isQueued) {
    // YELLOW STYLE FOR QUEUE
    cardStyleClass = 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-400 border-2 border-dashed';
  } else if (isGreenState) {
    cardStyleClass = 'bg-green-50 dark:bg-green-900/20 border-green-500 border-2';
  }

  // Helper text
  let statusText = "";
  let statusIcon = null;

  if (item.status === 'queued') {
      statusText = "Na Fila (Aguardando)";
      statusIcon = <Clock size={14} className="text-yellow-600 dark:text-yellow-500" />;
  } else if (item.status === 'processing_image') {
      statusText = "Otimizando Imagem...";
      statusIcon = <Loader2 size={14} className="animate-spin text-blue-500" />;
  } else if (item.status === 'analyzing_ai') {
      statusText = "Lendo Documento (IA)...";
      statusIcon = <Brain size={14} className="animate-pulse text-purple-500" />;
  } else if (item.status === 'uploading') {
      statusText = "Enviando para o Drive...";
      statusIcon = <Loader2 size={14} className="animate-spin text-yellow-500" />;
  } else if (isSuccess) {
      statusText = "Concluído";
      statusIcon = <CheckCircle size={14} className="text-green-600" />;
  } else if (isError) {
      statusText = item.errorMessage || "Erro no Processamento";
      statusIcon = <AlertCircle size={14} className="text-red-600" />;
  }

  // Show manual hint if it's an error OR if it's queued/waiting
  const showManualHint = (isError || isQueued) && (!item.data.numeroDoc || !item.data.dataEmissao);
  const showRetryAsUpload = (isError || isQueued) && item.data.numeroDoc && item.data.dataEmissao;

  // Allow editing unless it's actively processing or successfully finished
  const allowEditing = !isSuccess && !isActiveProcessing;

  // --- HANDLER FOR DATE MASKING ---
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/\D/g, ''); // Remove everything that isn't a number
    
    // Limit to 8 digits (DDMMAAAA)
    if (v.length > 8) v = v.slice(0, 8);

    // Apply Mask DD/MM/AAAA
    if (v.length >= 5) {
        v = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
    } else if (v.length >= 3) {
        v = `${v.slice(0, 2)}/${v.slice(2)}`;
    }
    
    onUpdateData(item.id, 'dataEmissao', v);
  };
  
  const showPreview = item.previewUrl && item.previewUrl !== 'error';

  return (
    <div className={`relative rounded-xl transition-all duration-300 overflow-hidden shadow-sm ${cardStyleClass}`}>
      
      {/* Progress Bar for active item */}
      {isActiveProcessing && (
         <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-300 z-10 w-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full w-full bg-white/50 animate-indeterminate-bar"></div>
         </div>
      )}

      <div className="p-3 flex gap-4">
        {/* Thumbnail Section - Reverted to Full View for correct Rotation handling */}
        <div className="relative w-24 h-32 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group border border-gray-200 dark:border-gray-600 shadow-inner">
          {showPreview ? (
            <div className="w-full h-full relative overflow-hidden bg-gray-900/5">
              {/* Image with object-contain to ensure rotation is visible correctly without cropping */}
              <img 
                src={item.previewUrl} 
                alt="Doc Preview" 
                style={{ 
                    transform: `rotate(${item.rotation || 0}deg)`
                }}
                className={`w-full h-full object-contain transition-all duration-300 ${isQueued ? 'opacity-80' : 'opacity-100'}`} 
              />
              
              {/* Overlay Actions */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 z-10">
                 {/* Zoom Button */}
                 <button onClick={() => onZoom(item.previewUrl!)} className="text-white p-2 hover:scale-110 transition-transform bg-white/20 rounded-full" title="Ver Fullscreen">
                    <ZoomIn size={18} />
                 </button>
                 
                 {/* Rotate Button */}
                 {allowEditing && (
                    <button onClick={() => onRotate(item.id)} className="text-white p-2 hover:scale-110 transition-transform bg-white/20 rounded-full" title="Girar Anti-horário">
                       <RotateCcw size={18} />
                    </button>
                 )}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1">
               {item.file.type === 'application/pdf' ? <FileText size={24} /> : <Loader2 className="animate-spin" />}
               <span className="text-[10px]">
                 {item.previewUrl === 'error' ? 'Erro img' : (item.file.type === 'application/pdf' ? 'Gerando...' : 'Carregando')}
               </span>
            </div>
          )}

          {/* Status Badge Overlays */}
          <div className="absolute top-1 right-1 z-20 pointer-events-none">
             {isSuccess && <div className="bg-green-500 text-white p-1 rounded-full shadow-md"><CheckCircle size={14} /></div>}
             {isReadyAndValid && <div className="bg-green-500 text-white p-1 rounded-full shadow-md"><PlayCircle size={14} /></div>}
             {isProblematic && <div className="bg-red-500 text-white p-1 rounded-full shadow-md"><AlertCircle size={14} /></div>}
             {isActiveProcessing && (
                <div className="bg-blue-500 text-white p-1 rounded-full shadow-md">
                    <Loader2 size={14} className="animate-spin"/>
                </div>
             )}
              {isQueued && (
                 <div className="bg-yellow-400 text-white p-1 rounded-full shadow-md">
                     <Clock size={14} />
                 </div>
             )}
          </div>
        </div>

        {/* Form Inputs Section */}
        <div className="flex-1 space-y-2 min-w-0">
          
          {/* Header Row: Filename & Remove Button */}
          <div className="flex justify-between items-start">
             <div className="flex flex-col w-full">
                <h4 className="text-xs font-mono text-gray-500 truncate max-w-[200px] mb-1">{item.file.name}</h4>
                
                {/* Status Text Feedback */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    {statusIcon}
                    <span className={`text-xs font-bold ${
                        isError ? 'text-red-700' : 
                        isSuccess ? 'text-green-700' : 
                        isActiveProcessing ? 'text-blue-600' :
                        isQueued ? 'text-yellow-700 dark:text-yellow-500' : 'text-gray-600'
                    }`}>
                        {statusText}
                    </span>
                </div>
                {/* Manual hint if quota exceeded */}
                {isError && !showRetryAsUpload && (
                   <div className="text-[10px] text-red-500 mt-0.5 leading-tight">
                      Preencha os dados abaixo e clique em Enviar Manualmente.
                   </div>
                )}
             </div>
             
             {!isActiveProcessing && !isSuccess && (
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
                  disabled={!allowEditing}
                  inputMode="numeric"
                  className={`w-full text-lg font-bold bg-transparent border-b focus:outline-none placeholder-gray-400 pb-1 transition-colors
                     ${isProblematic && !item.data.numeroDoc 
                        ? 'border-red-400 text-red-700 placeholder-red-300' 
                        : 'border-gray-300 text-brand-primary focus:border-brand-primary'}
                     ${!allowEditing ? 'opacity-50' : ''}
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
                  disabled={!allowEditing}
                  className={`w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent border-b border-gray-300 focus:border-brand-primary focus:outline-none placeholder-gray-400 pb-1 ${!allowEditing ? 'opacity-50' : ''}`}
                />
            </div>

            {/* Date Input with Auto-Mask */}
            <div className="col-span-2">
                 <input
                  type="text"
                  placeholder="DD/MM/AAAA"
                  value={item.data.dataEmissao}
                  onChange={handleDateChange}
                  disabled={!allowEditing}
                  maxLength={10}
                  inputMode="numeric"
                  className={`w-full text-sm bg-transparent border-b focus:outline-none placeholder-gray-400 pb-1 transition-colors
                      ${isProblematic && !item.data.dataEmissao 
                        ? 'border-red-400 text-red-700 placeholder-red-300' 
                        : 'border-gray-300 text-gray-700 dark:text-gray-300 focus:border-brand-primary'}
                      ${!allowEditing ? 'opacity-50' : ''}
                  `}
                />
            </div>
          </div>

          {/* Retry / Manual Upload Button */}
          {isError && (
            <Button 
                variant={showRetryAsUpload ? "primary" : "outline"}
                onClick={() => onRetry(item.id)} 
                className={`h-9 text-xs w-full mt-2 ${showRetryAsUpload ? 'bg-brand-primary text-white' : 'border-red-300 text-red-700 hover:bg-red-100 bg-white/50'}`}
            >
                {showRetryAsUpload ? (
                    <><Upload size={12} className="mr-2" /> Enviar Manualmente (Sem IA)</>
                ) : (
                    <><RotateCw size={12} className="mr-2" /> Tentar Novamente com IA</>
                )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};