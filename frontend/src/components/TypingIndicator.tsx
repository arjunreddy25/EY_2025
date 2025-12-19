import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface TypingIndicatorProps {
  toolName?: string | null;
  statusText?: string | null;
  className?: string;
}

export function TypingIndicator({ toolName, statusText, className }: TypingIndicatorProps) {
  // Priority: statusText > toolName > 'Processing...'
  const displayText = statusText || (toolName ? formatToolName(toolName) : 'Processing...');

  return (
    <div className={cn("flex items-center gap-2 px-4 py-2", className)}>
      <Loader2 className="size-4 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">
        {displayText}
      </span>
    </div>
  );
}

function formatToolName(toolName: string): string {
  const toolLabels: Record<string, string> = {
    'fetch_kyc_from_crm': 'Verifying identity...',
    'validate_loan_eligibility': 'Checking eligibility...',
    'calculate_emi': 'Calculating EMI...',
    'generate_sanction_letter': 'Creating sanction letter...',
    'fetch_preapproved_offer': 'Loading offer details...',
    'fetch_credit_score': 'Checking credit score...',
  };

  return toolLabels[toolName] || `Running ${toolName.replace(/_/g, ' ')}...`;
}

