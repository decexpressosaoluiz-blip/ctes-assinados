import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-brand-text dark:text-gray-300 mb-1">{label}</label>}
      <input
        className={`w-full rounded-xl border-gray-300 bg-white dark:bg-brand-dark dark:border-gray-600 dark:text-white shadow-sm focus:border-brand-primary focus:ring-brand-primary h-12 px-4 text-lg placeholder-gray-400 disabled:bg-gray-100 ${error ? 'border-brand-secondary' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-brand-secondary">{error}</p>}
    </div>
  );
};
