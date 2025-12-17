/**
 * useChat hook - Refactored to use React Query for data fetching.
 * Keeps WebSocket logic for real-time streaming.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSessions,
  useSession,
  useCreateSession,
  useDeleteSession,
  useSaveMessage,
  useGenerateTitle,
  chatKeys,
} from './useChatQueries';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  pdfUrl?: string;
  letterId?: string;
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

export function useChat(options: UseChatOptions = {}) {
  const {
    wsUrl = 'ws://localhost:8000/ws/chat',
    initialSessionId,
    onNavigate,
  } = options;

  // Local state for real-time messaging
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState(
    initialSessionId || `session_${Date.now()}`
  );

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const currentMessageRef = useRef<string>('');
  const pendingAssistantMessageRef = useRef<string>('');
  const currentSessionIdRef = useRef(currentSessionId);

  // Keep ref in sync
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // React Query hooks
  const queryClient = useQueryClient();
  const { data: sessions = [], isLoading: isLoadingSessions } = useSessions();

  // Only fetch session if it exists in sessions list (prevents 404 for new sessions)
  const sessionExists = sessions.some((s) => s.id === currentSessionId);
  const { data: sessionData } = useSession(sessionExists ? currentSessionId : null);

  const createSessionMutation = useCreateSession();
  const deleteSessionMutation = useDeleteSession();
  const saveMessageMutation = useSaveMessage();
  const generateTitleMutation = useGenerateTitle();

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

  // Load session messages when sessionData changes (only if we have messages and current is empty)
  useEffect(() => {
    if (sessionData?.messages && sessionData.messages.length > 0 && messages.length === 0) {
      setMessages(sessionData.messages);
    }
  }, [sessionData, messages.length]);

  // Save message helper using ref to avoid stale closures
  const saveMessage = useCallback(
    (role: 'user' | 'assistant', content: string, toolCalls?: ToolCall[]) => {
      saveMessageMutation.mutate({
        sessionId: currentSessionIdRef.current,
        role,
        content,
        toolCalls: toolCalls?.map((tc) => ({
          tool: tc.tool,
          agent: tc.agent,
          status: tc.status,
          result: tc.result,
        })),
      });
    },
    [saveMessageMutation]
  );

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${wsUrl}?session_id=${currentSessionIdRef.current}`);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onerror = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'ack':
          break;

        case 'content_start':
          currentMessageRef.current = '';
          pendingAssistantMessageRef.current = '';
          setMessages((prev) => [
            ...prev,
            {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: '',
              timestamp: new Date(),
              isStreaming: true,
              toolCalls: [],
            },
          ]);
          break;

        case 'content':
          currentMessageRef.current += data.data;
          pendingAssistantMessageRef.current = currentMessageRef.current;
          setMessages((prev) => {
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
          setMessages((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant') {
              lastMsg.toolCalls = [
                ...(lastMsg.toolCalls || []),
                { tool: data.tool, agent: data.agent, status: 'started' },
              ];
            }
            return updated;
          });
          break;

        case 'tool_complete':
        case 'member_tool_complete':
          setCurrentToolCall(null);
          setMessages((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant' && lastMsg.toolCalls) {
              const toolCall = lastMsg.toolCalls.find(
                (tc) => tc.tool === data.tool && tc.status === 'started'
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
          setMessages((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant') {
              lastMsg.isStreaming = false;
              // Save assistant message
              if (pendingAssistantMessageRef.current) {
                saveMessage('assistant', pendingAssistantMessageRef.current, lastMsg.toolCalls);
                pendingAssistantMessageRef.current = '';
              }
            }
            return updated;
          });
          break;

        case 'error':
          setIsLoading(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: `Error: ${data.message}`,
              timestamp: new Date(),
            },
          ]);
          break;

        case 'sanction_letter':
          // Backend has generated a sanction letter PDF - attach URL to current message
          setMessages((prev) => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg?.role === 'assistant') {
              lastMsg.pdfUrl = data.pdf_url;
              lastMsg.letterId = data.letter_id;
            }
            return updated;
          });
          break;
      }
    };

    wsRef.current = ws;
  }, [wsUrl, saveMessage]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Send a message
  const sendMessage = useCallback(
    async (content: string, file?: File) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
        setTimeout(() => sendMessage(content, file), 500);
        return;
      }

      const messageContent = file ? `${content}\n\n[Attached: ${file.name}]` : content;
      const isFirstMessage = messages.length === 0;

      // Auto-create session if this is the first message
      if (isFirstMessage) {
        const sessionExists = sessions.some((s) => s.id === currentSessionId);
        if (!sessionExists) {
          await createSessionMutation.mutateAsync({
            sessionId: currentSessionId,
            title: 'New Chat',
          });
          onNavigate?.(`/chat/${currentSessionId}`);
        }
      }

      // Add user message to UI
      const userMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: messageContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Save user message
      saveMessage('user', messageContent);

      // Generate AI title for first message
      if (isFirstMessage) {
        generateTitleMutation.mutate({
          sessionId: currentSessionId,
          message: content,
        });
      }

      // Get customer info and send to WebSocket
      const customer = getCustomerInfo();
      wsRef.current.send(
        JSON.stringify({
          message: content,
          customer_id: customer?.customer_id || null,
          customer_name: customer?.name || null,
        })
      );
    },
    [
      connect,
      currentSessionId,
      messages.length,
      sessions,
      createSessionMutation,
      saveMessage,
      generateTitleMutation,
      getCustomerInfo,
      onNavigate,
    ]
  );

  // Create new session (just resets state)
  const newSession = useCallback(() => {
    const newId = `session_${Date.now()}`;
    setCurrentSessionId(newId);
    setMessages([]);
    disconnect();
    onNavigate?.(`/chat/${newId}`);
    return newId;
  }, [disconnect, onNavigate]);

  // Load a session
  const loadSession = useCallback(
    (session: ChatSession) => {
      disconnect();
      setCurrentSessionId(session.id);
      setMessages([]); // Clear messages so they load from query
      onNavigate?.(`/chat/${session.id}`);
    },
    [disconnect, onNavigate]
  );

  // Delete a session with redirect
  const deleteSession = useCallback(
    (sessionId: string) => {
      deleteSessionMutation.mutate(sessionId, {
        onSuccess: () => {
          // If deleting current session, navigate to welcome screen
          if (sessionId === currentSessionId) {
            const newId = `session_${Date.now()}`;
            setCurrentSessionId(newId);
            setMessages([]);
            disconnect();
            onNavigate?.(`/`);
          }
        },
      });
    },
    [currentSessionId, deleteSessionMutation, disconnect, onNavigate]
  );

  // Refetch sessions
  const refetchSessions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: chatKeys.sessions() });
  }, [queryClient]);

  // Load initial session if provided
  useEffect(() => {
    if (initialSessionId) {
      setCurrentSessionId(initialSessionId);
    }
  }, [initialSessionId]);

  // Auto-connect on mount and session change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      connect();
    }, 100);
    return () => {
      clearTimeout(timeoutId);
      disconnect();
    };
  }, [currentSessionId]); // Only depend on sessionId, not on connect/disconnect

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
    fetchSessions: refetchSessions,
    connect,
    disconnect,
  };
}
