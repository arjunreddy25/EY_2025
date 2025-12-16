import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface TypingIndicatorProps {
  toolName?: string | null;
  className?: string;
}

export function TypingIndicator({ toolName, className }: TypingIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", className)}>
      <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2">
        {toolName ? (
          <>
            <Loader2 className="size-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              {formatToolName(toolName)}...
            </span>
          </>
        ) : (
          <>
            <div className="flex gap-1">
              <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: '0ms' }} />
              <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: '150ms' }} />
              <span className="size-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-sm text-muted-foreground">Thinking...</span>
          </>
        )}
      </div>
    </div>
  );
}

function formatToolName(toolName: string): string {
  const toolLabels: Record<string, string> = {
    'get_customer_info': 'Fetching customer details',
    'get_credit_score': 'Checking credit score',
    'verify_kyc': 'Verifying KYC details',
    'check_loan_eligibility': 'Evaluating loan eligibility',
    'calculate_emi': 'Calculating EMI',
    'generate_sanction_letter': 'Generating sanction letter',
    'get_pre_approved_offers': 'Fetching pre-approved offers',
  };

  return toolLabels[toolName] || toolName.replace(/_/g, ' ');
}
