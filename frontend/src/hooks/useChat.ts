import { useState, useEffect, useCallback, useRef } from 'react';

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
  messages: Message[];
}

interface UseChatOptions {
  wsUrl?: string;
  sessionId?: string;
}

export function useChat(options: UseChatOptions = {}) {
  const { 
    wsUrl = 'ws://localhost:8000/ws/chat',
    sessionId = `session_${Date.now()}`
  } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  
  const wsRef = useRef<WebSocket | null>(null);
  const currentMessageRef = useRef<string>('');

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
          // Message acknowledged, waiting for response
          break;
          
        case 'content_start':
          currentMessageRef.current = '';
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
  }, [wsUrl, currentSessionId]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Send a message
  const sendMessage = useCallback((content: string, file?: File) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connect();
      setTimeout(() => sendMessage(content, file), 500);
      return;
    }

    // Add user message
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: file ? `${content}\n\n[Attached: ${file.name}]` : content,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Get customer info from localStorage (set by ref link auth)
    let customer_id: string | null = null;
    let customer_name: string | null = null;

    try {
      const customerStr = localStorage.getItem('customer');
      if (customerStr) {
        const customer = JSON.parse(customerStr);
        customer_id = customer.customer_id;
        customer_name = customer.name;
      }
    } catch (e) {
      console.warn('Could not parse customer from localStorage:', e);
    }

    // Send to WebSocket with customer context
    wsRef.current.send(JSON.stringify({
      message: content,
      customer_id,
      customer_name
    }));
  }, [connect]);

  // Create new session
  const newSession = useCallback(() => {
    // Save current session if it has messages
    if (messages.length > 0) {
      const session: ChatSession = {
        id: currentSessionId,
        title: messages[0]?.content.slice(0, 30) + '...' || 'New Chat',
        createdAt: new Date(),
        messages: [...messages]
      };
      setSessions(prev => [session, ...prev]);
    }

    // Reset for new session
    const newId = `session_${Date.now()}`;
    setCurrentSessionId(newId);
    setMessages([]);
    disconnect();
  }, [messages, currentSessionId, disconnect]);

  // Load a session
  const loadSession = useCallback((session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    disconnect();
  }, [disconnect]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    messages,
    isConnected,
    isLoading,
    currentToolCall,
    sessions,
    currentSessionId,
    sendMessage,
    newSession,
    loadSession,
    connect,
    disconnect
  };
}
