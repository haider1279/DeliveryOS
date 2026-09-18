import React from 'react';

export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  }[size];

  return (
    <div className={`flex items-center justify-center p-6 ${className}`}>
      <div
        className={`${sizeClasses} animate-spin rounded-full border-brand-200 border-t-brand-600`}
      />
    </div>
  );
};
