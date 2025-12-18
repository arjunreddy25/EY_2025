import { useState } from 'react';
import { Mail, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface InlineEmailInputProps {
  onCustomerFound: (customer: { customer_id: string; name: string; email: string }) => void;
  onNewUser: () => void;
}

export function InlineEmailInput({ onCustomerFound, onNewUser }: InlineEmailInputProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const response = await fetch(`${API_BASE}/auth/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });

      const data = await response.json();

      if (data.exists) {
        // Customer found - store in localStorage and callback
        const customerData = {
          customer_id: data.customer_id,
          name: data.name,
          email: data.email
        };
        localStorage.setItem('customer', JSON.stringify(customerData));
        localStorage.setItem('user', JSON.stringify(customerData));
        onCustomerFound(customerData);
      } else {
        // New user
        setNotFound(true);
      }
    } catch (err) {
      console.error('Lookup failed:', err);
      setError('Unable to verify. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueAsNew = () => {
    // Store email for new user flow
    localStorage.setItem('pending_email', email);
    onNewUser();
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-md bg-gradient-to-br from-card to-card/80 border-border/50 shadow-xl">
        <CardContent className="pt-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Welcome to Loan Assistant</h2>
            <p className="text-muted-foreground text-sm mt-2">
              Enter your registered email to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                  setNotFound(false);
                }}
                className="h-12 text-base"
                disabled={isLoading}
                autoFocus
              />
              
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base cursor-pointer"
              disabled={isLoading || !email.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          {notFound && (
            <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-3">
                We don't have your records yet. You can apply for a loan by chatting with our assistant.
              </p>
              <Button 
                variant="outline" 
                className="w-full cursor-pointer"
                onClick={handleContinueAsNew}
              >
                Continue as New Customer
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center mt-6">
            Your information is secure and encrypted
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
