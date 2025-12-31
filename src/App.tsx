import React, { useState, useRef, useEffect } from 'react';
import { Camera, Search, Moon, Sun, Truck, ChevronLeft, ChevronRight, X, Image as ImageIcon, Search as SearchIcon, Loader2, ZoomIn, ZoomOut, RotateCcw, Download } from 'lucide-react';
import { UploadPage } from './pages/UploadPage';
import { AppView } from './types';

// --- CONFIGURAÇÃO ---
const API_URL = "https://script.google.com/macros/s/AKfycbzA9xFaLJ2UKEKUP4O-eM1zVGxaq51oZDxFjQHxlLOiy044xTftAwNnigxMdC3Q1PyH/exec";

interface GroupedDoc {
  id: string;
  serie: string;
  pages: string[];
}

export default function App() {
  const [view, setView] = useState<AppView>('upload');
  const [darkMode, setDarkMode] = useState(false);

  // Search State
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GroupedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<GroupedDoc | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Viewer State (Zoom & Pan)
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Toggle Dark Mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Reset zoom and pan when page or doc changes
  useEffect(() => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  }, [currentPage, selectedDoc]);

  // Reset pan when zoom returns to 1
  useEffect(() => {
    if (zoomLevel === 1) {
        setPan({ x: 0, y: 0 });
    }
  }, [zoomLevel]);

  // Debounced Auto-Search
  useEffect(() => {
    const timer = setTimeout(() => {
      // Reduced delay for snappier feel (was 800ms)
      if (query.length >= 2) {
        handleSearch();
      }
    }, 400); 

    return () => clearTimeout(timer);
  }, [query]);

  // Search Function
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!API_URL) {
      setError("Configuração necessária: Adicione a URL do Script no código.");
      return;
    }

    if (!query || query.length < 2) {
      if (!e) return;
      // Silent return if just typing, error if submitted manually
      return;
    }

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const url = `${API_URL}?q=${encodeURIComponent(query)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Erro na conexão: ${response.status}`);
      }

      const rawData = await response.json();

      let dataArray: any[] = [];
      if (Array.isArray(rawData)) {
        dataArray = rawData;
      } else if (rawData && typeof rawData === 'object') {
         if (Array.isArray((rawData as any).results)) dataArray = (rawData as any).results;
         else if (Array.isArray((rawData as any).data)) dataArray = (rawData as any).data;
         else if ((rawData as any).encontrado) dataArray = [rawData];
      }

      const groups: Record<string, GroupedDoc> = {};

      dataArray.forEach((item: any) => {
          const rawId = item.numero_documento || item.nome || item.numero || item.id;
          const docId = String(rawId).trim();
          
          if (!docId) return;

          if (!groups[docId]) {
              groups[docId] = {
                  id: docId,
                  serie: String(item.serie || 'N/A'),
                  pages: []
              };
          }

          // Handle various image property names
          const link = item.link_preview || item.imagem || item.url || item.url_drive;
          if (link && !groups[docId].pages.includes(link)) {
              groups[docId].pages.push(link);
          }

          if (Array.isArray(item.images)) {
              item.images.forEach((img: string) => {
                  if (!groups[docId].pages.includes(img)) {
                      groups[docId].pages.push(img);
                  }
              });
          }
      });

      const groupedResults = Object.values(groups);
      setSearchResults(groupedResults);

      // --- LOGIC UPDATED FOR AUTO-REFRESH ---
      if (groupedResults.length > 0) {
          // 1. Exact Match Priority
          const exactMatch = groupedResults.find(doc => doc.id === query);
          
          if (exactMatch) {
              handleSelectDoc(exactMatch);
          } 
          // 2. Single Result Priority
          else if (groupedResults.length === 1) {
              handleSelectDoc(groupedResults[0]);
          }
          // 3. If currently selected doc is NO LONGER in the results, clear it to show list
          else if (selectedDoc) {
             const stillExists = groupedResults.some(doc => doc.id === selectedDoc.id);
             if (!stillExists) {
                 setSelectedDoc(null);
             }
          }
      } else {
          // If search returns nothing, clear the current view so user knows it wasn't found
          if (selectedDoc) {
              setSelectedDoc(null);
          }
      }

    } catch (err: any) {
      console.error("Fetch Error:", err);
      setError(`Erro ao buscar: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // View Handlers
  const handleSelectDoc = (doc: GroupedDoc) => {
    // Only update if it's actually different or forced reload
    // But setting state is cheap in React, ensures view is fresh
    setSelectedDoc(doc);
    setCurrentPage(0);
    setZoomLevel(1);
  };

  const clearSearch = () => {
    setQuery('');
    setSelectedDoc(null);
    setSearchResults([]);
    setError(null);
    setHasSearched(false);
  };

  const handleNextPage = () => {
    if (selectedDoc && currentPage < selectedDoc.pages.length - 1) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  };

  // Zoom Handlers
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 1));
  const handleResetZoom = () => {
      setZoomLevel(1);
      setPan({ x: 0, y: 0 });
  };
  
  // Download Logic
  const handleDownload = async () => {
      if (!selectedDoc || !selectedDoc.pages[currentPage]) return;
      
      setIsDownloading(true);

      try {
          const imageUrl = selectedDoc.pages[currentPage];
          const safeId = selectedDoc.id.replace(/[^a-z0-9]/gi, '_');
          const filename = `CTE_${safeId}_Pg${currentPage + 1}.jpg`;

          const response = await fetch(imageUrl, {
              method: 'GET',
              mode: 'cors',
              cache: 'no-cache'
          });

          if (!response.ok) throw new Error("Falha ao baixar imagem");

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = filename;
          
          document.body.appendChild(a);
          a.click();
          
          setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }, 1000); 

      } catch (err) {
          console.error(`Download failed:`, err);
          window.open(selectedDoc.pages[currentPage], '_blank');
      } finally {
          setIsDownloading(false);
      }
  };

  // --- DRAG (PAN) HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (zoomLevel <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      setPan({ 
          x: e.clientX - dragStartRef.current.x, 
          y: e.clientY - dragStartRef.current.y 
      });
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
      if (zoomLevel <= 1) return;
      setIsDragging(true);
      const touch = e.touches[0];
      dragStartRef.current = { x: touch.clientX - pan.x, y: touch.clientY - pan.y };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault(); 
      const touch = e.touches[0];
      setPan({ 
          x: touch.clientX - dragStartRef.current.x, 
          y: touch.clientY - dragStartRef.current.y 
      });
  };

  const handleTouchEnd = () => setIsDragging(false);


  return (
    <div className="h-screen w-full flex flex-col bg-brand-lightBg dark:bg-brand-deep overflow-hidden">
      
      {/* Top Bar */}
      <nav className="h-16 bg-gradient-to-r from-brand-primary to-brand-secondary shadow-lg flex items-center justify-between px-4 z-10 shrink-0">
        <div className="flex items-center gap-2 text-white">
          <Truck className="w-6 h-6" />
          <span className="font-bold text-lg tracking-tight">São Luiz Express</span>
        </div>
        <button 
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        <div className="flex-1 overflow-y-auto scroll-smooth p-4">
          
          {view === 'upload' && <UploadPage />}
          
          {view === 'search' && (
            <div className="max-w-lg mx-auto flex flex-col gap-6">
               <header>
                <h1 className="text-2xl font-bold text-brand-primary dark:text-white">Buscar Documento</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Digite o número do CTE para visualizar.</p>
              </header>

              {!API_URL && (
                <div className="bg-red-50 p-4 rounded text-red-700 text-sm border border-red-200">
                    URL da API não configurada no código!
                </div>
              )}

              {/* Search Form */}
              <div className="relative z-30" ref={searchContainerRef}>
                <form onSubmit={handleSearch} className="relative flex gap-2">
                  <div className="relative flex-1">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            if (error) setError(null);
                        }}
                        placeholder="Digite o número..."
                        className="w-full h-12 pl-12 pr-10 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-brand-dark text-lg shadow-sm focus:ring-2 focus:ring-brand-primary dark:text-white transition-all"
                    />
                    <div className="absolute left-4 top-3.5 text-gray-400">
                        <SearchIcon size={20} />
                    </div>
                    {query && (
                        <button type="button" onClick={clearSearch} className="absolute right-3 top-3.5 text-gray-400 hover:text-red-500">
                        <X size={20} />
                        </button>
                    )}
                  </div>
                  <button 
                    type="submit"
                    disabled={isLoading}
                    className="bg-brand-primary text-white px-6 rounded-xl font-bold hover:bg-brand-focus disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? <Loader2 className="animate-spin" /> : 'Buscar'}
                  </button>
                </form>

                {error && (
                    <div className="mt-3 text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                        {error}
                    </div>
                )}
                
                {!isLoading && hasSearched && searchResults.length === 0 && !error && (
                    <div className="mt-3 text-gray-500 text-sm text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        Nenhum documento encontrado para "{query}".
                    </div>
                )}
                
                {/* Results List */}
                {searchResults.length > 0 && !selectedDoc && (
                  <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                    <h3 className="font-bold text-gray-700 dark:text-gray-300">Resultados Encontrados:</h3>
                    {searchResults.map((doc) => (
                        <button
                        key={doc.id}
                        onClick={() => handleSelectDoc(doc)}
                        className="w-full text-left px-4 py-3 bg-white dark:bg-brand-dark border border-gray-200 dark:border-gray-700 rounded-xl hover:shadow-md transition-all flex items-center justify-between group"
                        >
                        <span className="font-mono font-bold text-brand-primary dark:text-brand-soft">CTE {doc.id}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-500 dark:text-gray-300">
                                Série {doc.serie}
                            </span>
                            <span className="text-xs text-gray-400 group-hover:text-brand-primary transition-colors">
                            {doc.pages.length} pág(s)
                            </span>
                        </div>
                        </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Document Viewer */}
              {selectedDoc && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                  <div className="bg-white dark:bg-brand-dark/50 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
                    
                    {/* Header */}
                    <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-brand-dark">
                      <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">CTE {selectedDoc.id}</h2>
                        <p className="text-xs text-gray-500">Série {selectedDoc.serie} • {selectedDoc.pages.length} Páginas</p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <button onClick={() => setSelectedDoc(null)} className="text-sm text-brand-primary underline hover:text-brand-focus mr-2">
                           {searchResults.length > 1 ? "Lista" : "Fechar"}
                        </button>
                        <div className="bg-brand-primary/10 text-brand-primary text-xs font-bold px-2 py-1 rounded">
                            {currentPage + 1}/{selectedDoc.pages.length}
                        </div>
                      </div>
                    </div>

                    {/* Toolbar: Zoom & Download */}
                    <div className="flex items-center justify-between p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center gap-1">
                            <div className="flex items-center bg-white dark:bg-gray-700 rounded-lg p-0.5 border border-gray-200 dark:border-gray-600 shadow-sm">
                                <button 
                                    onClick={handleZoomOut} 
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"
                                    title="Diminuir Zoom"
                                >
                                    <ZoomOut size={16}/>
                                </button>
                                <span className="text-xs font-mono font-medium w-10 text-center text-gray-700 dark:text-gray-200">
                                    {Math.round(zoomLevel * 100)}%
                                </span>
                                <button 
                                    onClick={handleZoomIn} 
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"
                                    title="Aumentar Zoom"
                                >
                                    <ZoomIn size={16}/>
                                </button>
                                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                                <button 
                                    onClick={handleResetZoom} 
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300"
                                    title="Resetar"
                                >
                                    <RotateCcw size={16}/>
                                </button>
                            </div>
                        </div>
                        <button 
                            onClick={handleDownload} 
                            disabled={isDownloading}
                            className="flex items-center gap-1 px-3 py-1.5 bg-brand-primary text-white text-xs font-bold rounded-lg hover:bg-brand-focus transition-colors shadow-sm disabled:opacity-50"
                        >
                            {isDownloading ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Download size={14} /> 
                            )}
                            {isDownloading 
                                ? 'Baixando...' 
                                : (selectedDoc.pages.length > 1 ? `Baixar Página ${currentPage + 1}` : 'Baixar')
                            }
                        </button>
                    </div>

                    {/* Image Canvas Container with DRAG HANDLERS */}
                    <div 
                        className={`relative w-full aspect-[3/4] bg-gray-100 dark:bg-black/40 group overflow-hidden ${zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseLeave}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                      {/* Flex container to center image when zoom is 1 */}
                      <div className="w-full h-full flex items-center justify-center p-4">
                          {selectedDoc.pages[currentPage] ? (
                              <img 
                                src={selectedDoc.pages[currentPage]} 
                                alt={`Página ${currentPage + 1}`}
                                draggable={false} 
                                style={{ 
                                    // Apply Translation AND Scale
                                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`, 
                                    // Disable transition while dragging for performance/instant response
                                    transition: isDragging ? 'none' : 'transform 0.2s ease-out' 
                                }}
                                className="max-w-full max-h-full object-contain shadow-lg select-none"
                              />
                          ) : (
                              <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-2">
                                  <ImageIcon size={48} className="opacity-20" />
                                  <span className="text-sm opacity-50">Imagem indisponível</span>
                              </div>
                          )}
                      </div>

                      {/* Pagination Controls - Fixed relative to container to stay visible */}
                      {selectedDoc.pages.length > 1 && (
                        <>
                          {currentPage > 0 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handlePrevPage(); }} 
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 dark:bg-black/60 rounded-full flex items-center justify-center shadow-lg text-brand-primary dark:text-white z-20 hover:scale-110 transition-transform"
                            >
                              <ChevronLeft size={24} />
                            </button>
                          )}
                          {currentPage < selectedDoc.pages.length - 1 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleNextPage(); }} 
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 dark:bg-black/60 rounded-full flex items-center justify-center shadow-lg text-brand-primary dark:text-white z-20 hover:scale-110 transition-transform"
                            >
                              <ChevronRight size={24} />
                            </button>
                          )}
                          
                           {/* Page Indicators */}
                           <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-none">
                                {selectedDoc.pages.map((_, idx) => (
                                    <div 
                                        key={idx} 
                                        className={`w-2 h-2 rounded-full shadow-sm transition-all ${idx === currentPage ? 'bg-brand-primary scale-110' : 'bg-white/70'}`}
                                    />
                                ))}
                           </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="h-16 bg-white dark:bg-brand-dark border-t border-gray-200 dark:border-brand-primary/20 flex justify-around items-center px-2 shrink-0 pb-safe z-50">
        <NavButton 
          active={view === 'upload'} 
          onClick={() => setView('upload')} 
          icon={<Camera size={24} />} 
          label="Capturar" 
        />
        <NavButton 
          active={view === 'search'} 
          onClick={() => setView('search')} 
          icon={<Search size={24} />} 
          label="Buscar" 
        />
      </nav>
    </div>
  );
}

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 ${
      active ? 'text-brand-primary dark:text-brand-soft -translate-y-1' : 'text-gray-400 dark:text-gray-500'
    }`}
  >
    <div className={`p-1 rounded-xl ${active ? 'bg-brand-primary/10 dark:bg-brand-soft/10' : ''}`}>
      {icon}
    </div>
    <span className="text-xs font-medium mt-1">{label}</span>
  </button>
);