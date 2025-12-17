import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'http://localhost:8000';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  tool: string;
  agent?: string;
  status: 'started' | 'completed';
  result?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt?: Date;
  messageCount?: number;
  lastMessagePreview?: string;
  messages?: Message[];
}

interface UseChatOptions {
  wsUrl?: string;
  initialSessionId?: string;
  onNavigate?: (path: string) => void;
}

// Helper to get/set anonymous session IDs in localStorage
function getStoredSessionIds(): string[] {
  try {
    const ids = localStorage.getItem('chat_session_ids');
    return ids ? JSON.parse(ids) : [];
  } catch {
    return [];
  }
}

function addStoredSessionId(sessionId: string): void {
  const ids = getStoredSessionIds();
  if (!ids.includes(sessionId)) {
    ids.unshift(sessionId);
    localStorage.setItem('chat_session_ids', JSON.stringify(ids.slice(0, 50)));
  }
}

function removeStoredSessionId(sessionId: string): void {
  const ids = getStoredSessionIds().filter(id => id !== sessionId);
  localStorage.setItem('chat_session_ids', JSON.stringify(ids));
}

export function useChat(options: UseChatOptions = {}) {
  const { 
    wsUrl = 'ws://localhost:8000/ws/chat',
    initialSessionId,
    onNavigate
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [currentToolCall, setCurrentToolCall] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId || `session_${Date.now()}`);
  
  const wsRef = useRef<WebSocket | null>(null);
  const currentMessageRef = useRef<string>('');
  const pendingAssistantMessageRef = useRef<string>('');

  // Get customer info from localStorage
  const getCustomerInfo = useCallback(() => {
    try {
      const customerStr = localStorage.getItem('customer');
      if (customerStr) {
        return JSON.parse(customerStr);
      }
    } catch (e) {
      console.warn('Could not parse customer from localStorage:', e);
    }
    return null;
  }, []);

  // Fetch sessions from API
  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const customer = getCustomerInfo();

      if (customer?.customer_id) {
        // Logged-in user: fetch by customer_id
        const res = await fetch(`${API_BASE}/chat/sessions?customer_id=${customer.customer_id}`);
        if (res.ok) {
          const data = await res.json();
          setSessions(data.map((s: any) => ({
            id: s.session_id,
            title: s.title || 'New Chat',
            createdAt: new Date(s.created_at),
            updatedAt: s.updated_at ? new Date(s.updated_at) : undefined,
            messageCount: s.message_count,
            lastMessagePreview: s.last_message_preview
          })));
        }
      } else {
        // Anonymous user: fetch by stored session IDs
        const storedIds = getStoredSessionIds();
        if (storedIds.length > 0) {
          const res = await fetch(`${API_BASE}/chat/sessions/by-ids`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_ids: storedIds })
          });
          if (res.ok) {
            const data = await res.json();
            setSessions(data.map((s: any) => ({
              id: s.session_id,
              title: s.title || 'New Chat',
              createdAt: new Date(s.created_at),
              updatedAt: s.updated_at ? new Date(s.updated_at) : undefined,
              messageCount: s.message_count,
              lastMessagePreview: s.last_message_preview
            })));
          }
        } else {
          setSessions([]);
        }
      }
    } catch (e) {
      console.error('Error fetching sessions:', e);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [getCustomerInfo]);

  // Save message to API and update local state optimistically
  const saveMessageToAPI = useCallback(async (sessionId: string, role: string, content: string, toolCalls?: ToolCall[]) => {
    try {
      const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content, tool_calls: toolCalls })
      });

      if (response.ok && role === 'user') {
        // Update local session title optimistically for first user message
        setSessions(prev => {
          const session = prev.find(s => s.id === sessionId);
          if (session && (session.title === 'New Chat' || !session.title)) {
            // Use first 40 chars of message as title (will be replaced by AI title later)
            const newTitle = content.length > 40 ? content.slice(0, 40) + '...' : content;
            return prev.map(s =>
              s.id === sessionId
                ? { ...s, title: newTitle, lastMessagePreview: content }
                : s
            );
          }
          return prev;
        });

        // Request AI-generated title (non-blocking)
        fetch(`${API_BASE}/chat/sessions/${sessionId}/generate-title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content })
        }).then(async res => {
          if (res.ok) {
            const data = await res.json();
            if (data.title) {
              setSessions(prev => prev.map(s =>
                s.id === sessionId ? { ...s, title: data.title } : s
              ));
            }
          }
        }).catch(() => { }); // Ignore errors, title already set to truncated message
      }
    } catch (e) {
      console.error('Error saving message:', e);
    }
  }, []);

  // Create session in API
  const createSessionInAPI = useCallback(async (sessionId: string, title: string = 'New Chat') => {
    try {
      const customer = getCustomerInfo();
      await fetch(`${API_BASE}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          customer_id: customer?.customer_id || null,
          title
        })
      });
      // Track in localStorage for anonymous users
      addStoredSessionId(sessionId);
    } catch (e) {
      console.error('Error creating session:', e);
    }
  }, [getCustomerInfo]);

  // Load session messages from API
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const loadedMessages: Message[] = (data.messages || []).map((m: any) => ({
          id: `msg_${m.id}`,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
          toolCalls: m.tool_calls || []
        }));
        setMessages(loadedMessages);
        return loadedMessages;
      }
    } catch (e) {
      console.error('Error loading session messages:', e);
    }
    return [];
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${wsUrl}?session_id=${currentSessionId}`);
    
    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'ack':
          break;
          
        case 'content_start':
          currentMessageRef.current = '';
          pendingAssistantMessageRef.current = '';
          setMessages(prev => [
            ...prev,
            {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: '',
              timestamp: new Date(),
              isStreaming: true,
              toolCalls: []
            }
          ]);
          break;
          
        case 'content':
          currentMessageRef.current += data.data;
          pendingAssistantMessageRef.current = currentMessageRef.current;
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant') {
              lastMsg.content = currentMessageRef.current;
            }
            return updated;
          });
          break;
          
        case 'tool_start':
        case 'member_tool_start':
          setCurrentToolCall(data.tool);
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant') {
              lastMsg.toolCalls = [
                ...(lastMsg.toolCalls || []),
                { tool: data.tool, agent: data.agent, status: 'started' }
              ];
            }
            return updated;
          });
          break;
          
        case 'tool_complete':
        case 'member_tool_complete':
          setCurrentToolCall(null);
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant' && lastMsg.toolCalls) {
              const toolCall = lastMsg.toolCalls.find(
                tc => tc.tool === data.tool && tc.status === 'started'
              );
              if (toolCall) {
                toolCall.status = 'completed';
                toolCall.result = data.result;
              }
            }
            return updated;
          });
          break;
          
        case 'done':
          setIsLoading(false);
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant') {
              lastMsg.isStreaming = false;
              // Save assistant message to API
              if (pendingAssistantMessageRef.current) {
                saveMessageToAPI(currentSessionId, 'assistant', pendingAssistantMessageRef.current, lastMsg.toolCalls);
                pendingAssistantMessageRef.current = '';
              }
            }
            return updated;
          });
          break;
          
        case 'error':
          setIsLoading(false);
          setMessages(prev => [
            ...prev,
            {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: `Error: ${data.message}`,
              timestamp: new Date()
            }
          ]);
          break;
      }
    };

    wsRef.current = ws;
  }, [wsUrl, currentSessionId, saveMessageToAPI]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Send a message
  const sendMessage = useCallback(async (content: string, file?: File) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connect();
      setTimeout(() => sendMessage(content, file), 500);
      return;
    }

    const messageContent = file ? `${content}\n\n[Attached: ${file.name}]` : content;

    // Auto-create session if this is the first message (messages is empty)
    const isFirstMessage = messages.length === 0;
    if (isFirstMessage) {
      // Check if session exists in our local sessions list
      const sessionExists = sessions.some(s => s.id === currentSessionId);
      if (!sessionExists) {
        // Create session in API first
        await createSessionInAPI(currentSessionId, 'New Chat');
        // Update local sessions list
        setSessions(prev => [{
          id: currentSessionId,
          title: 'New Chat',
          createdAt: new Date(),
          messageCount: 0
        }, ...prev]);
        // Navigate to the new session URL
        onNavigate?.(`/chat/${currentSessionId}`);
      }
    }

    // Add user message to UI
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Save user message to API
    await saveMessageToAPI(currentSessionId, 'user', messageContent);

    // Get customer info
    const customer = getCustomerInfo();

    // Send to WebSocket
    wsRef.current.send(JSON.stringify({
      message: content,
      customer_id: customer?.customer_id || null,
      customer_name: customer?.name || null
    }));
  }, [connect, currentSessionId, saveMessageToAPI, getCustomerInfo, messages.length, sessions, createSessionInAPI, onNavigate]);

  // Create new session - just resets state, actual session is created on first message
  const newSession = useCallback(async () => {
    const newId = `session_${Date.now()}`;

    // Just update state - don't create in API yet (will be created on first message)
    setCurrentSessionId(newId);
    setMessages([]);
    disconnect();

    // Navigate to new session URL (will show welcome screen since no messages)
    onNavigate?.(`/chat/${newId}`);

    return newId;
  }, [disconnect, onNavigate]);

  // Load a session
  const loadSession = useCallback(async (session: ChatSession) => {
    disconnect();
    setCurrentSessionId(session.id);

    // Navigate to session URL
    onNavigate?.(`/chat/${session.id}`);

    await loadSessionMessages(session.id);
  }, [disconnect, loadSessionMessages, onNavigate]);

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`${API_BASE}/chat/sessions/${sessionId}`, { method: 'DELETE' });
      removeStoredSessionId(sessionId);

      // If deleting current session, create new one
      if (sessionId === currentSessionId) {
        await newSession();
      } else {
        await fetchSessions();
      }
    } catch (e) {
      console.error('Error deleting session:', e);
    }
  }, [currentSessionId, newSession, fetchSessions]);

  // Load initial session if provided
  useEffect(() => {
    if (initialSessionId) {
      loadSessionMessages(initialSessionId);
      setCurrentSessionId(initialSessionId);
    }
  }, [initialSessionId, loadSessionMessages]);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Auto-connect on session change
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    messages,
    isConnected,
    isLoading,
    isLoadingSessions,
    currentToolCall,
    sessions,
    currentSessionId,
    sendMessage,
    newSession,
    loadSession,
    deleteSession,
    fetchSessions,
    connect,
    disconnect
  };
}
