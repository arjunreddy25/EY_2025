import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Phone, ArrowRight, Loader2, KeyRound } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface PhoneVerificationProps {
  onVerified: (customer: { customer_id: string; name: string; email: string; phone: string }) => void;
  onNewUser: (phone: string) => void;
}

export function PhoneVerification({ onVerified, onNewUser }: PhoneVerificationProps) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCustomer, setPendingCustomer] = useState<any>(null);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/auth/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone })
      });

      const data = await response.json();

      if (data.exists) {
        // Customer found - proceed to OTP
        setPendingCustomer({
          customer_id: data.customer_id,
          name: data.name,
          email: data.email,
          phone: cleanPhone
        });
        setStep('otp');
      } else {
        // New user - open KYC dialog
        onNewUser(cleanPhone);
      }
    } catch (err) {
      console.error('Lookup failed:', err);
      setError('Unable to verify. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Demo OTP: 123456
    if (otp !== '123456') {
      setError('Invalid OTP. Try 123456');
      return;
    }

    setIsLoading(true);
    
    // Simulate OTP verification delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (pendingCustomer) {
      localStorage.setItem('customer', JSON.stringify(pendingCustomer));
      localStorage.setItem('user', JSON.stringify(pendingCustomer));
      onVerified(pendingCustomer);
    }
    
    setIsLoading(false);
  };

  return (
    <div className="border-t bg-muted/30 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {step === 'phone' ? (
          <form onSubmit={handlePhoneSubmit} className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Verify to continue:</span>
            </div>
            <Input
              type="tel"
              placeholder="Enter phone number"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError(null);
              }}
              className="flex-1 max-w-xs h-9"
              disabled={isLoading}
              autoFocus
            />
            <Button 
              type="submit" 
              size="sm"
              className="h-9 cursor-pointer"
              disabled={isLoading || !phone.trim()}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Send OTP
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
            {error && <span className="text-destructive text-sm">{error}</span>}
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <KeyRound className="w-4 h-4" />
              <span className="text-sm">Enter OTP sent to {phone}:</span>
            </div>
            <Input
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                setError(null);
              }}
              className="w-28 h-9 text-center tracking-widest"
              disabled={isLoading}
              autoFocus
              maxLength={6}
            />
            <Button 
              type="submit" 
              size="sm"
              className="h-9 cursor-pointer"
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Verify'
              )}
            </Button>
            <Button 
              type="button" 
              variant="ghost"
              size="sm"
              className="h-9 cursor-pointer"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError(null);
              }}
            >
              Change
            </Button>
            {error && <span className="text-destructive text-sm">{error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
