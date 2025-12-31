import React, { useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

interface ImageZoomModalProps {
  isOpen: boolean;
  imageUrl: string;
  rotation?: number;
  onClose: () => void;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ isOpen, imageUrl, rotation = 0, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Reset scale when image changes or modal opens
  useEffect(() => {
    if (isOpen) setScale(1);
  }, [isOpen, imageUrl]);

  if (!isOpen) return null;

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    // Zoom logic: Scroll Up (negative deltaY) -> Zoom In
    const newScale = scale + (e.deltaY < 0 ? 0.2 : -0.2);
    setScale(Math.min(Math.max(1, newScale), 5)); // Clamp between 1x and 5x
  };

  const toggleZoom = () => {
    setScale(scale > 1.2 ? 1 : 2.5);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md">
      {/* Controls - High Z-index to stay on top */}
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 z-[110] p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors backdrop-blur-md shadow-lg border border-white/10"
      >
        <X size={28} />
      </button>

      {/* Instructions */}
      <div className="absolute bottom-10 left-0 right-0 z-[110] flex justify-center pointer-events-none">
        <p className="text-white/90 text-sm bg-black/60 px-4 py-2 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
          {scale === 1 ? "Duplo clique para zoom" : "Arraste para mover • Duplo clique para sair"}
        </p>
      </div>

      {/* Image Container - Clips overflow */}
      <div 
        ref={containerRef} 
        className="w-full h-full flex items-center justify-center overflow-hidden p-4"
        onWheel={handleWheel}
      >
        <motion.img
          src={imageUrl}
          alt="Zoom Preview"
          
          // Drag Logic
          drag
          // FIX: When zoomed in (scale > 1), we remove strict layout constraints (containerRef) 
          // and use large pixel values to allow panning to edges. 
          // When scale === 1, we use containerRef so it snaps back to center if dragged.
          dragConstraints={scale > 1 ? { left: -1500, right: 1500, top: -1500, bottom: 1500 } : containerRef}
          dragElastic={0.1}
          dragMomentum={false} // Prevents sliding too far after release
          
          // Animation & Zoom
          initial={{ opacity: 0, scale: 0.8 }}
          // We apply the visual rotation here
          animate={{ opacity: 1, scale: scale, rotate: rotation }}
          transition={{ duration: 0.2 }}
          
          // Interactions
          onDoubleClick={toggleZoom}
          className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing shadow-2xl"
          
          // CRITICAL: Disables browser scrolling so drag works on mobile
          style={{ touchAction: "none" }} 
        />
      </div>
    </div>
  );
};