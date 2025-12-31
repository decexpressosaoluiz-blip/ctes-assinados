import React, { useState, useEffect, useRef } from 'react';
import { Search, ExternalLink, XCircle, Clock, Info, CheckCircle, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { searchDocument, getSearchSuggestions } from '../services/api';
import { SearchResult, SearchSuggestion } from '../../types';
import { ImageZoomModal } from '../components/BatchUploader/ImageZoomModal';

export const SearchPage: React.FC = () => {
  // Search State
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Results State
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  
  // Zoom State
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  // Debounce Logic
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch Suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (debouncedQuery.length >= 2) {
        // Only fetch if it looks like a number (at least partially)
        const numericPart = debouncedQuery.replace(/\D/g, '');
        if (numericPart.length >= 2) {
            const results = await getSearchSuggestions(numericPart);
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery]);

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.numero);
    setShowSuggestions(false);
    performSearch(suggestion.numero);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    performSearch(query);
  };

  const performSearch = async (searchInfo: string) => {
    // Sanitize
    const sanitizedQuery = searchInfo.replace(/\D/g, '').replace(/^0+/, '');

    if (!sanitizedQuery) return;

    setIsLoading(true);
    setResult(null);

    try {
      const data = await searchDocument(sanitizedQuery);
      setResult(data);
    } catch (error) {
      setResult({ found: false, message: "Erro de conexão inesperado." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto p-4 space-y-6">
       <header className="mb-4">
        <h1 className="text-2xl font-bold text-brand-primary dark:text-white">Buscar CTE</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Localize documentos digitalizados.</p>
      </header>

      {/* Search Input & Autocomplete */}
      <div className="relative z-20">
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <Input 
            placeholder="Digite o número (ex: 1467)" 
            value={query}
            onChange={(e) => {
                setQuery(e.target.value);
                // Hide results if user starts typing again
                if (result) setResult(null); 
            }}
            onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onBlur={() => {
                // Delay hiding to allow click event on suggestion to fire
                setTimeout(() => setShowSuggestions(false), 200);
            }}
            className="flex-1 font-mono text-lg"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
          />
          <Button type="submit" disabled={isLoading} variant="primary" className="aspect-square px-0 w-12 shrink-0">
            <Search />
          </Button>
        </form>

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-14 mt-1 bg-white dark:bg-brand-deep border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                {suggestions.map((s, idx) => (
                    <button
                        key={`${s.numero}-${idx}`}
                        className="w-full text-left px-4 py-3 hover:bg-brand-surface dark:hover:bg-brand-dark transition-colors flex justify-between items-center group"
                        onClick={() => handleSelectSuggestion(s)}
                    >
                        <span className="font-mono text-brand-primary dark:text-brand-soft font-bold text-lg">{s.numero}</span>
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <span>Série {s.serie}</span>
                            <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </button>
                ))}
            </div>
        )}

        <p className="text-xs text-gray-400 px-1 mt-2 flex items-center gap-1">
          <Info size={12} />
          Digite sem pontos ou zeros à esquerda.
        </p>
      </div>

      {isLoading && (
        <div className="py-10 text-center text-gray-400 animate-pulse">
           <div className="animate-spin w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-2"></div>
           Buscando <strong>{query.replace(/\D/g, '').replace(/^0+/, '')}</strong>...
        </div>
      )}

      {result && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
          {result.found ? (
            <Card className="overflow-hidden p-0 border-l-4 border-l-green-500 shadow-lg">
              {/* Result Header */}
              <div className="bg-green-50 dark:bg-green-900/20 p-4 border-b border-green-100 dark:border-green-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold">
                  <CheckCircle size={20} />
                  <span>CTE {result.docInfo?.numero}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs font-mono bg-white dark:bg-brand-dark px-2 py-1 rounded text-gray-500 border border-gray-200 dark:border-gray-700">
                    Série {result.docInfo?.serie}
                  </span>
                </div>
              </div>
              
              {/* Image Gallery */}
              <div className="p-4 space-y-4">
                {result.images && result.images.length > 0 ? (
                  <div className={`grid gap-3 ${result.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {result.images.map((imgUrl, index) => (
                        <div 
                            key={index}
                            className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 cursor-zoom-in aspect-[3/4]"
                            onClick={() => setZoomUrl(imgUrl)}
                        >
                             {/* eslint-disable-next-line @next/next/no-img-element */}
                             <img 
                                src={imgUrl} 
                                alt={`Página ${index + 1}`} 
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                loading="lazy"
                             />
                             <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <div className="bg-black/50 text-white px-2 py-1 rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                    Página {index + 1}
                                </div>
                             </div>
                        </div>
                    ))}
                  </div>
                ) : (
                   <div className="h-32 bg-gray-50 flex flex-col items-center justify-center text-gray-400 italic text-sm border border-dashed rounded-lg gap-2">
                     <ImageIcon size={24} className="opacity-20" />
                     Visualização não disponível
                   </div>
                )}
                
                {/* Actions */}
                {result.url_drive && (
                  <a 
                    href={result.url_drive} 
                    target="_blank" 
                    rel="noreferrer"
                    className="block w-full"
                  >
                    <Button variant="primary" fullWidth className="bg-brand-primary hover:bg-brand-focus">
                      <ExternalLink className="mr-2 h-4 w-4" /> Abrir Pasta no Google Drive
                    </Button>
                  </a>
                )}
              </div>
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center py-8 text-center gap-4 bg-red-50 dark:bg-brand-dark border-brand-secondary/20 shadow-none">
              <div className="bg-red-100 p-3 rounded-full">
                <XCircle className="w-8 h-8 text-brand-secondary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">Não Encontrado</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 max-w-[280px] mx-auto leading-relaxed mt-2">
                   {result.message}
                </p>
                <div className="mt-6 flex items-start justify-center gap-2 text-xs text-gray-500 bg-white dark:bg-gray-800 p-3 rounded-lg text-left max-w-xs mx-auto border border-gray-100 dark:border-gray-700 shadow-sm">
                  <Clock size={14} className="mt-0.5 shrink-0 text-brand-primary" />
                  <span>Dica: Se você acabou de enviar o documento, aguarde alguns segundos para o sistema atualizar.</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Image Zoom Modal */}
      <ImageZoomModal 
         isOpen={!!zoomUrl} 
         imageUrl={zoomUrl || ''} 
         onClose={() => setZoomUrl(null)} 
      />
    </div>
  );
};
