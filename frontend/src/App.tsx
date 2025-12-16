import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { ChatLayout } from './components/ChatLayout';
import { CRMDashboard } from './components/CRMDashboard';

function RefVerifier() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const ref = searchParams.get('ref');

    if (ref) {
      setIsVerifying(true);

      // Verify ref and get customer identity
      fetch(`http://localhost:8000/auth/verify-ref?ref=${ref}`)
        .then(res => {
          if (!res.ok) throw new Error('Invalid or expired link');
          return res.json();
        })
        .then(data => {
          if (data.customer_id) {
            // Store customer identity
            localStorage.setItem('customer', JSON.stringify(data));
            localStorage.setItem('user', JSON.stringify({
              email: data.email,
              name: data.name,
              customer_id: data.customer_id
            }));

            // Navigate to clean URL
            navigate('/', { replace: true });
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RefVerifier />} />
        <Route path="/crm" element={<CRMDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
