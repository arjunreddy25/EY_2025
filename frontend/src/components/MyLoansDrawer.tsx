import { X, FileText, Download, CheckCircle2, Clock, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { 
  useCustomerLoans,
  useCustomerDocuments,
  useCurrentCustomerId
} from '@/hooks/useChatQueries';

interface MyLoansDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MyLoansDrawer({ isOpen, onClose }: MyLoansDrawerProps) {
  const customerId = useCurrentCustomerId();

  const {
    data: loansData,
    isLoading: loansLoading,
    error: loansError
  } = useCustomerLoans(isOpen ? customerId : null);

  const {
    data: docsData,
    isLoading: docsLoading
  } = useCustomerDocuments(isOpen ? customerId : null);

  const isLoading = loansLoading || docsLoading;
  const loans = loansData?.loans || [];
  const documents = docsData?.documents || null;
  const customerName = loansData?.customerName || docsData?.customerName || '';

  const formatCurrency = (amount: number) => {
    return `Rs. ${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-full max-w-md bg-background border-l shadow-xl z-50",
        "transform transition-transform duration-300 ease-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="size-5" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">My Loans</h2>
              {customerName && (
                <p className="text-xs text-muted-foreground">{customerName}</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>

        <ScrollArea className="flex-1 h-[calc(100vh-80px)]">
          <div className="p-4 space-y-6">
            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}

            {/* Error State */}
            {loansError && !customerId && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Please log in to view your loans</p>
              </div>
            )}

            {/* Salary Slip Verification Status */}
            {!isLoading && documents && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Salary Verification</h3>
                <div className={cn(
                  "p-4 rounded-lg border",
                  documents.salary_slip.verified 
                    ? "bg-green-500/10 border-green-500/30" 
                    : "bg-muted/50 border-border"
                )}>
                  <div className="flex items-center gap-3">
                    {documents.salary_slip.verified ? (
                      <CheckCircle2 className="size-5 text-green-500" />
                    ) : (
                      <Clock className="size-5 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">
                        {documents.salary_slip.verified ? 'Salary Slip Verified' : 'Not Verified'}
                      </p>
                      {documents.salary_slip.verified_at && (
                        <p className="text-xs text-muted-foreground">
                          Verified on {formatDate(documents.salary_slip.verified_at)}
                        </p>
                      )}
                    </div>
                    {documents.salary_slip.url && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => window.open(documents.salary_slip.url!, '_blank')}
                      >
                        <Download className="size-4 mr-1" />
                        View
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Sanctioned Loans */}
            {!isLoading && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  Sanctioned Loans ({loans.length})
                </h3>
                
                {loans.length === 0 ? (
                  <div className="text-center py-8 bg-muted/30 rounded-lg">
                    <FileText className="size-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">No loans sanctioned yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {loans.map((loan) => (
                      <div 
                        key={loan.application_id}
                        className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-lg">
                              {formatCurrency(loan.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {loan.tenure_months} months @ {loan.interest_rate}% p.a.
                            </p>
                          </div>
                          <Badge variant={loan.status === 'SANCTIONED' ? 'default' : 'secondary'}>
                            {loan.status}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="text-muted-foreground">EMI: </span>
                            <span className="font-medium">{formatCurrency(loan.monthly_emi)}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(loan.createdAt)}
                          </span>
                        </div>

                        {loan.sanction_letter_url && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="w-full mt-3"
                            onClick={() => window.open(loan.sanction_letter_url, '_blank')}
                          >
                            <Download className="size-4 mr-2" />
                            Download Sanction Letter
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
