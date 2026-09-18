import React from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const getColors = () => {
    switch (status?.toUpperCase()) {
      case 'APPROVED':
      case 'PAID':
      case 'DONE':
      case 'COMPLETED':
      case 'DEPLOYED':
      case 'ACTIVE':
      case 'PASS':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/20';

      case 'IN_PROGRESS':
      case 'IN_DEVELOPMENT':
      case 'UNDER_REVIEW':
      case 'PARTIALLY_PAID':
      case 'READY_FOR_QA':
      case 'TRIAGED':
        return 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-600/20';

      case 'WAITING_FOR_APPROVAL':
      case 'CLIENT_REVIEW':
      case 'ESTIMATING':
      case 'SUBMITTED':
      case 'READY_FOR_RETEST':
      case 'READY':
        return 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-600/20';

      case 'BLOCKED':
      case 'REJECTED':
      case 'FAIL':
      case 'OVERDUE':
      case 'CRITICAL':
      case 'HIGH':
        return 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-600/20';

      case 'TODO':
      case 'DRAFT':
      case 'PLANNED':
      case 'OPEN':
        return 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-600/20';

      case 'CLOSED':
      case 'ARCHIVED':
      case 'CANCELLED':
      case 'VOID':
        return 'bg-gray-100 text-gray-500 border-gray-200 ring-gray-600/20';

      default:
        return 'bg-slate-50 text-slate-600 border-slate-200 ring-slate-500/10';
    }
  };

  const formattedStatus = status ? status.replace(/_/g, ' ') : 'Unknown';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ring-1 ring-inset capitalize ${getColors()} ${className}`}
    >
      {formattedStatus.toLowerCase()}
    </span>
  );
};
