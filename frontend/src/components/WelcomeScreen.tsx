import { Button } from '@/components/ui/button';
import { CreditCard, FileText, Calculator, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WelcomeScreenProps {
  onSuggestionClick?: (suggestion: string) => void;
}

const suggestions = [
  {
    icon: CreditCard,
    title: 'Check my loan eligibility',
    prompt: 'Hi, I want to check if I am eligible for a personal loan. My customer ID is CUST001.',
  },
  {
    icon: Calculator,
    title: 'Calculate EMI',
    prompt: 'Can you help me calculate the EMI for a loan of ₹5,00,000 for 3 years?',
  },
  {
    icon: FileText,
    title: 'Apply for a loan',
    prompt: 'I would like to apply for a personal loan. My customer ID is CUST003.',
  },
  {
    icon: MessageSquare,
    title: 'Know more about offers',
    prompt: 'What pre-approved loan offers do I have? My customer ID is CUST005.',
  },
];

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-8">
      <div className="text-center">
        {/* Logo / Title */}
        <div className="mb-6">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <CreditCard className="size-8" />
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            Loan Sales Assistant
          </h1>
          <p className="text-muted-foreground">
            Your AI-powered personal loan advisor. Get instant eligibility checks, <br className="hidden sm:inline" />
            personalized offers, and hassle-free loan approvals.
          </p>
        </div>

        {/* Suggestions */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {suggestions.map((suggestion, index) => (
            <Button
              key={index}
              variant="outline"
              onClick={() => onSuggestionClick?.(suggestion.prompt)}
              className={cn(
                "group h-auto flex-col items-start gap-2 p-4 text-left",
                "hover:bg-accent hover:shadow-md transition-all duration-200"
              )}
            >
              <div className="flex items-center gap-2">
                <suggestion.icon className="size-4 text-primary" />
                <span className="font-medium">{suggestion.title}</span>
              </div>
              <span className="text-xs text-muted-foreground line-clamp-2">
                {suggestion.prompt}
              </span>
            </Button>
          ))}
        </div>

        {/* Features */}
        <div className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-green-500" />
            <span>Instant Eligibility</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-blue-500" />
            <span>KYC Verification</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-purple-500" />
            <span>Auto Sanction Letter</span>
          </div>
        </div>
      </div>
    </div>
  );
}
