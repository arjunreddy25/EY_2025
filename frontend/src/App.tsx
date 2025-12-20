import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { ChatLayout } from './components/ChatLayout';
import { CRMDashboard } from './components/CRMDashboard';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function RefVerifier() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const ref = searchParams.get('ref');

    if (ref) {
      setIsVerifying(true);

      // Verify ref and get customer identity
      fetch(`${API_BASE}/auth/verify-ref?ref=${ref}`)
        .then(res => {
          if (!res.ok) throw new Error('Invalid or expired link');
          return res.json();
        })
        .then(async (data) => {
          if (data.customer_id) {
            // Store customer identity
            localStorage.setItem('customer', JSON.stringify(data));
            localStorage.setItem('user', JSON.stringify({
              email: data.email,
              name: data.name,
              customer_id: data.customer_id
            }));

            // Link any anonymous sessions to this customer
            const storedIds = JSON.parse(localStorage.getItem('chat_session_ids') || '[]');
            if (storedIds.length > 0) {
              try {
                await fetch(`${API_BASE}/chat/sessions/link-to-customer?customer_id=${data.customer_id}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ session_ids: storedIds })
                });
              } catch (e) {
                console.warn('Could not link sessions to customer:', e);
              }
            }

            // Create a new session for this verified customer
            const newSessionId = `session_${Date.now()}`;
            try {
              // 1. Create the session
              await fetch(`${API_BASE}/chat/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  session_id: newSessionId,
                  customer_id: data.customer_id,
                  title: `Chat with ${data.name || 'Customer'}`
                })
              });

              // 2. Save greeting message to DB (so it loads on session fetch)
              const greeting = `Hello ${data.name || 'there'}! 👋\n\nWelcome to NBFC Personal Loans. I'm your digital loan assistant.\n\nGreat news — you've been **pre-approved** for a personal loan! I'm here to help you:\n\n• Calculate your EMI for any amount\n• Complete quick KYC verification\n• Get your loan sanctioned in minutes\n\nHow much loan amount are you looking for, and over what tenure?`;

              await fetch(`${API_BASE}/chat/sessions/${newSessionId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'assistant', content: greeting })
              });

              // Track in localStorage
              const ids = JSON.parse(localStorage.getItem('chat_session_ids') || '[]');
              if (!ids.includes(newSessionId)) {
                ids.unshift(newSessionId);
                localStorage.setItem('chat_session_ids', JSON.stringify(ids.slice(0, 50)));
              }

              // 3. Navigate to the chat (session already has greeting in DB)
              navigate(`/chat/${newSessionId}`, { replace: true });
            } catch (e) {
              console.warn('Could not create session:', e);
              navigate('/', { replace: true });
            }
          }
        })
        .catch(err => {
          console.error('Error verifying link:', err);
          navigate('/', { replace: true });
        })
        .finally(() => {
          setIsVerifying(false);
        });
    }
  }, [searchParams, navigate]);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verifying your link...</p>
        </div>
      </div>
    );
  }

  return <ChatLayout />;
}

function ChatWithId() {
  const { chatId } = useParams<{ chatId: string }>();
  return <ChatLayout chatId={chatId} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RefVerifier />} />
        <Route path="/chat/:chatId" element={<ChatWithId />} />
        <Route path="/crm" element={<CRMDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

