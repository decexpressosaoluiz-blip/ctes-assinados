import React, { useState } from 'react';
import { Camera, Search, Moon, Sun, Truck } from 'lucide-react';
import { UploadPage } from './pages/UploadPage';
import { SearchPage } from './pages/SearchPage';
import { AppView } from '../types';

export default function App() {
  const [view, setView] = useState<AppView>('upload');
  const [darkMode, setDarkMode] = useState(false);

  // Toggle Dark Mode
  React.useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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
      <main className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-y-auto scroll-smooth">
          {view === 'upload' && <UploadPage />}
          {view === 'search' && <SearchPage />}
        </div>
      </main>

      {/* Bottom Navigation (Mobile First) */}
      <nav className="h-16 bg-white dark:bg-brand-dark border-t border-gray-200 dark:border-brand-primary/20 flex justify-around items-center px-2 shrink-0 pb-safe">
        <NavButton 
          active={view === 'upload'} 
          onClick={() => setView('upload')} 
          icon={<Camera />} 
          label="Capturar" 
        />
        <NavButton 
          active={view === 'search'} 
          onClick={() => setView('search')} 
          icon={<Search />} 
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