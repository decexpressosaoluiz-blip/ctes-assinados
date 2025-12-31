import React from 'react';

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white dark:bg-brand-dark/50 backdrop-blur-sm rounded-xl border border-brand-surface dark:border-brand-primary/20 shadow-md p-5 ${className}`}>
      {children}
    </div>
  );
};
