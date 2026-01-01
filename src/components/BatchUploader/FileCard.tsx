import React from 'react';
import { X, AlertCircle, CheckCircle, RotateCw, ZoomIn, Loader2, PlayCircle, Clock, FileText, Brain, Upload, RotateCcw, AlertTriangle, PauseCircle } from 'lucide-react';
import { BatchItem } from '../../types';
import { Button } from '../ui/Button';

interface FileCardProps {
  item: BatchItem;
  onRemove: (id: string) => void;
  onUpdateData: (id: string, field: keyof BatchItem['data'], value: string) => void;
  onRetry: (id: string) => void;
  onConfirm?: (id: string) => void; 
  onZoom: (url: string) => void;
  onRotate: (id: string) => void;
  onTogglePause?: (id: string) => void;
}

export const FileCard: React.FC<FileCardProps> = ({ item, onRemove, onUpdateData, onRetry, onConfirm, onZoom, onRotate, onTogglePause }) => {
  // 1. Determine State
  const isActiveProcessing = 
    item.status === 'processing_image' || 
    item.status === 'analyzing_ai' || 
    item.status === 'uploading';

  const isQueued = item.status === 'queued';
  const isPaused = item.status === 'paused';
  const isSuccess = item.status === 'success';
  const isError = item.status === 'error';
  // 'ready' means waiting for review/confirmation
  const isReviewNeeded = item.status === 'ready'; 
  
  // Data Validation
  const isDataIncomplete = !item.data.numeroDoc || !item.data.dataEmissao || !item.data.serie;
  const isProblematic = isError;

  // 3. Dynamic Styles
  let cardStyleClass = 'bg-white dark:bg-brand-dark/40 border-gray-200 dark:border-gray-700 border'; // Default

  if (isProblematic) {
    cardStyleClass = 'bg-red-50 dark:bg-red-900/20 border-red-500 border-2';
  } else if (isReviewNeeded) {
    cardStyleClass = 'bg-orange-50 dark:bg-orange-900/10 border-orange-400 border-2';
  } else if (isActiveProcessing) {
    cardStyleClass = 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 border-2 shadow-md scale-[1.01] z-10';
  } else if (isQueued) {
    cardStyleClass = 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-400 border-2 border-dashed';
  } else if (isPaused) {
    cardStyleClass = 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 border opacity-80';
  } else if (isSuccess) {
    cardStyleClass = 'bg-green-50 dark:bg-green-900/20 border-green-500 border-2';
  }

  // Helper text
  let statusText = "";
  let statusIcon = null;

  if (item.status === 'queued') {
      statusText = "Na Fila (Aguardando)";
      statusIcon = <Clock size={14} className="text-yellow-600 dark:text-yellow-500" />;
  } else if (item.status === 'paused') {
      statusText = "Pausado";
      statusIcon = <PauseCircle size={14} className="text-gray-500" />;
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
  } else if (isReviewNeeded) {
      statusText = "Confirme os Dados";
      statusIcon = <AlertTriangle size={14} className="text-orange-500" />;
  }

  const showRetryAsUpload = (isError || isQueued) && !isDataIncomplete;
  const allowEditing = !isSuccess && !isActiveProcessing;
  
  // Handler for Date Masking
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 8) v = v.slice(0, 8);
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
      
      {/* Progress Bar */}
      {isActiveProcessing && (
         <div className="absolute top-0 left-0 h-1 bg-blue-500 transition-all duration-300 z-10 w-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full w-full bg-white/50 animate-indeterminate-bar"></div>
         </div>
      )}

      <div className="p-3 flex gap-4">
        {/* Thumbnail Section */}
        <div className="relative w-24 h-32 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group border border-gray-200 dark:border-gray-600 shadow-inner">
          {showPreview ? (
            <div className="w-full h-full relative overflow-hidden bg-gray-900/5">
              <img 
                src={item.previewUrl} 
                alt="Doc Preview" 
                style={{ 
                    transform: `rotate(${item.rotation || 0}deg)`
                }}
                className={`w-full h-full object-contain transition-all duration-300 ${isQueued || isPaused ? 'opacity-80' : 'opacity-100'}`} 
              />
              
              {/* PERMANENT OVERLAY ACTIONS (No Hover Required) */}
              <div className="absolute bottom-1 right-1 left-1 flex justify-center gap-2 z-20">
                 {/* Zoom Button */}
                 <button 
                    onClick={(e) => { e.stopPropagation(); onZoom(item.previewUrl!); }} 
                    className="bg-black/40 text-white p-1.5 rounded-full hover:bg-black/60 backdrop-blur-sm transition-colors border border-white/10" 
                    title="Ver Fullscreen"
                 >
                    <ZoomIn size={14} />
                 </button>
                 
                 {/* Rotate Button */}
                 {allowEditing && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onRotate(item.id); }} 
                        className="bg-black/40 text-white p-1.5 rounded-full hover:bg-black/60 backdrop-blur-sm transition-colors border border-white/10" 
                        title="Girar Anti-horário"
                    >
                       <RotateCcw size={14} />
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
             {isProblematic && <div className="bg-red-500 text-white p-1 rounded-full shadow-md"><AlertCircle size={14} /></div>}
             {isReviewNeeded && <div className="bg-orange-500 text-white p-1 rounded-full shadow-md"><AlertTriangle size={14} /></div>}
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
             {isPaused && (
                 <div className="bg-gray-500 text-white p-1 rounded-full shadow-md">
                     <PauseCircle size={14} />
                 </div>
             )}
          </div>
        </div>

        {/* Form Inputs Section */}
        <div className="flex-1 space-y-2 min-w-0">
          
          {/* Header Row */}
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
                        isReviewNeeded ? 'text-orange-600' :
                        isPaused ? 'text-gray-500' :
                        isQueued ? 'text-yellow-700 dark:text-yellow-500' : 'text-gray-600'
                    }`}>
                        {statusText}
                    </span>
                </div>
                {/* Manual hint */}
                {isError && !showRetryAsUpload && (
                   <div className="text-[10px] text-red-500 mt-0.5 leading-tight">
                      Preencha todos os campos.
                   </div>
                )}
             </div>
             
             <div className="flex items-center gap-1 -mt-1 -mr-1">
                 {/* Pause/Resume Button */}
                 {onTogglePause && (isQueued || isPaused) && (
                     <button 
                        onClick={() => onTogglePause(item.id)} 
                        className={`p-1.5 rounded-lg transition-colors ${isPaused ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'}`}
                        title={isPaused ? "Retomar" : "Pausar este item"}
                     >
                        {isPaused ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
                     </button>
                 )}
                 
                 {!isActiveProcessing && !isSuccess && (
                    <button onClick={() => onRemove(item.id)} className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                        <X size={18} />
                    </button>
                 )}
             </div>
          </div>

          {/* Inputs Grid */}
          <div className="grid grid-cols-[2fr_1fr] gap-3 items-end">
            <div>
                <input
                  type="text"
                  placeholder="Ex: 27681"
                  value={item.data.numeroDoc}
                  onChange={(e) => onUpdateData(item.id, 'numeroDoc', e.target.value.replace(/\D/g, ''))}
                  disabled={!allowEditing}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`w-full h-8 text-lg font-bold bg-transparent border-b focus:outline-none placeholder-gray-400 transition-colors
                     ${(isProblematic || (isReviewNeeded && !item.data.numeroDoc))
                        ? 'border-red-400 text-red-700 placeholder-red-300' 
                        : 'border-gray-300 text-brand-primary focus:border-brand-primary'}
                     ${!allowEditing ? 'opacity-50' : ''}
                  `}
                />
            </div>
            
             <div>
                <input
                  type="text"
                  placeholder="Série"
                  value={item.data.serie}
                  onChange={(e) => onUpdateData(item.id, 'serie', e.target.value.replace(/\D/g, ''))}
                  disabled={!allowEditing}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`w-full h-8 text-base text-gray-700 dark:text-gray-300 bg-transparent border-b focus:outline-none placeholder-gray-400 transition-colors
                     ${(isProblematic || (isReviewNeeded && !item.data.serie))
                        ? 'border-red-400 text-red-700 placeholder-red-300' 
                        : 'border-gray-300 focus:border-brand-primary'}
                     ${!allowEditing ? 'opacity-50' : ''}
                  `}
                />
            </div>
          </div>
          
          {/* Date Input */}
          <div className="w-full">
                 <input
                  type="text"
                  placeholder="DD/MM/AAAA"
                  value={item.data.dataEmissao}
                  onChange={handleDateChange}
                  disabled={!allowEditing}
                  maxLength={10}
                  inputMode="numeric"
                  className={`w-full h-8 text-sm bg-transparent border-b focus:outline-none placeholder-gray-400 transition-colors
                      ${(isProblematic || (isReviewNeeded && !item.data.dataEmissao))
                        ? 'border-red-400 text-red-700 placeholder-red-300' 
                        : 'border-gray-300 text-gray-700 dark:text-gray-300 focus:border-brand-primary'}
                      ${!allowEditing ? 'opacity-50' : ''}
                  `}
                />
          </div>

          {/* Action Buttons */}
          <div className="mt-2 flex gap-2">
            {isReviewNeeded && onConfirm && (
                <Button 
                    variant="primary"
                    onClick={() => onConfirm(item.id)}
                    className="h-9 text-xs w-full bg-orange-500 hover:bg-orange-600 text-white animate-in zoom-in duration-200"
                >
                    <CheckCircle size={14} className="mr-2" /> Confirmar e Enviar
                </Button>
            )}

            {isError && (
                <Button 
                    variant={showRetryAsUpload ? "primary" : "outline"}
                    onClick={() => onRetry(item.id)} 
                    className={`h-9 text-xs w-full ${showRetryAsUpload ? 'bg-brand-primary text-white' : 'border-red-300 text-red-700 hover:bg-red-100 bg-white/50'}`}
                >
                    {showRetryAsUpload ? (
                        <><Upload size={12} className="mr-2" /> Enviar Manualmente</>
                    ) : (
                        <><RotateCw size={12} className="mr-2" /> Tentar Novamente com IA</>
                    )}
                </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};