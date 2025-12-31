import React, { useState } from 'react';
import { Search, ExternalLink, FileText, XCircle, Clock, Info, CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { searchDocument } from '../services/api';
import { SearchResult } from '../../types';

export const SearchPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [lastSearched, setLastSearched] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Sanitize input: Remove non-digits and leading zeros
    // Example: "001.467" -> "1467"
    const sanitizedQuery = query.replace(/\D/g, '').replace(/^0+/, '');

    if (!sanitizedQuery) return;

    setIsLoading(true);
    setResult(null);
    setLastSearched(sanitizedQuery);

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

      <div className="space-y-2">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input 
            placeholder="Digite apenas números (ex: 1467)" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 font-mono text-lg"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
          />
          <Button type="submit" disabled={isLoading} variant="primary" className="aspect-square px-0 w-12 shrink-0">
            <Search />
          </Button>
        </form>
        <p className="text-xs text-gray-400 px-1 flex items-center gap-1">
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
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {result.found ? (
            <Card className="overflow-hidden p-0 border-l-4 border-l-green-500 shadow-lg">
              {/* Header */}
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
              
              {/* Content */}
              <div className="p-4 space-y-4">
                {result.url_preview ? (
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 min-h-[200px] flex items-center justify-center relative group">
                     {/* eslint-disable-next-line @next/next/no-img-element */}
                     <img 
                      src={result.url_preview} 
                      alt={`CTE ${result.docInfo?.numero}`} 
                      className="max-w-full max-h-[400px] object-contain" 
                      loading="lazy"
                     />
                  </div>
                ) : (
                   <div className="h-32 bg-gray-50 flex items-center justify-center text-gray-400 italic text-sm border border-dashed rounded-lg">
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
                      <ExternalLink className="mr-2 h-4 w-4" /> Abrir no Google Drive
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
    </div>
  );
};