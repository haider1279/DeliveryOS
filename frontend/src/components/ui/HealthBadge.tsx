import React from 'react';
import { ProjectHealthStatus } from '@deliveryos/shared';

interface HealthBadgeProps {
  status: ProjectHealthStatus | string;
  className?: string;
  showDot?: boolean;
}

export const HealthBadge: React.FC<HealthBadgeProps> = ({
  status,
  className = '',
  showDot = true,
}) => {
  const getStyles = () => {
    switch (status) {
      case 'ON_TRACK':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
          label: 'On Track',
        };
      case 'AT_RISK':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500',
          label: 'At Risk',
        };
      case 'BLOCKED':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500 animate-pulse',
          label: 'Blocked',
        };
      case 'DELAYED':
        return {
          bg: 'bg-red-50 text-red-700 border-red-200',
          dot: 'bg-red-500',
          label: 'Delayed',
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          dot: 'bg-slate-400',
          label: status || 'Unknown',
        };
    }
  };

  const style = getStyles();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.bg} ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
      {style.label}
    </span>
  );
};
