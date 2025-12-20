/**
 * useChat hook - Refactored to use SSE (Server-Sent Events) for streaming.
 * Simpler and more reliable than WebSocket for unidirectional streaming.
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

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

export interface AgentDecision {
  id: string;
  agent: string;
  decisionType: string;
  details: string;
  summary: string;
  timestamp: Date;
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
  initialSessionId?: string;
  onNavigate?: (path: string) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const { initialSessionId, onNavigate } = options;

  // Local state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState(
    initialSessionId || `session_${Date.now()}`
  );
  const [agentDecisions, setAgentDecisions] = useState<AgentDecision[]>([]);

  // Refs
  const currentMessageRef = useRef<string>('');
  const currentSessionIdRef = useRef(currentSessionId);
  const autoGreetSentRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Keep ref in sync
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // React Query hooks
  const queryClient = useQueryClient();
  const { data: sessions = [], isLoading: isLoadingSessions } = useSessions();

  // Only fetch session if it exists in sessions list
  const sessionExists = sessions.some((s) => s.id === currentSessionId);
  const { data: sessionData, isLoading: isSessionDataLoading } = useSession(sessionExists ? currentSessionId : null);

  // Session is loading when we're fetching existing session data
  const isLoadingSession = sessionExists && isSessionDataLoading && messages.length === 0;

  const createSessionMutation = useCreateSession();
  const deleteSessionMutation = useDeleteSession();
  const saveMessageMutation = useSaveMessage();
  const generateTitleMutation = useGenerateTitle();

  // Check if we need to refetch sessions (e.g., after email redirect)
  useEffect(() => {
    const needsRefetch = localStorage.getItem('newSessionToRefetch');
    if (needsRefetch) {
      localStorage.removeItem('newSessionToRefetch');
      queryClient.invalidateQueries({ queryKey: chatKeys.sessions() });
    }
  }, [queryClient]);

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

  // Load session messages when sessionData changes
  useEffect(() => {
    if (sessionData?.messages && sessionData.messages.length > 0 && messages.length === 0) {
      setMessages(sessionData.messages);
    }
  }, [sessionData, messages.length]);

  // Save message helper
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

  // Send message using SSE for streaming response
  const sendMessage = useCallback(
    async (content: string, file?: File) => {
      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      let messageContent = content;

      // Handle file upload
      if (file) {
        try {
          const formData = new FormData();
          formData.append('file', file);

          const uploadResponse = await fetch(`${API_BASE}/upload/salary-slip`, {
            method: 'POST',
            body: formData,
          });

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            const extracted = uploadData.extracted;
            if (extracted?.status === 'success') {
              messageContent = `${content}\n\n[SALARY SLIP VERIFIED: Net Salary = ₹${extracted.net_salary?.toLocaleString() || 'Unknown'}, Employer = ${extracted.employer || 'Unknown'}, Period = ${extracted.pay_period || 'Unknown'}]`;
            } else {
              messageContent = `${content}\n\n[Salary slip processing failed: ${extracted?.message || 'Unknown error'}]`;
            }
          } else {
            messageContent = `${content}\n\n[Attached: ${file.name} - upload failed]`;
          }
        } catch (error) {
          console.error('File upload error:', error);
          messageContent = `${content}\n\n[Attached: ${file.name} - upload failed]`;
        }
      }

      const isFirstMessage = messages.length === 0;

      // Create session if first message
      if (isFirstMessage) {
        try {
          await createSessionMutation.mutateAsync({
            sessionId: currentSessionIdRef.current,
            title: 'New Chat',
          });

          // Update URL without navigation
          window.history.replaceState(null, '', `/chat/${currentSessionIdRef.current}`);
        } catch (e) {
          console.error('Failed to create session:', e);
        }
      }

      // Add user message to UI
      const displayContent = file ? `${content}\n\n📎 Attached: ${file.name}` : content;
      const userMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: displayContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Save user message
      saveMessage('user', messageContent);

      // Generate AI title on first user message
      const userMessageCount = messages.filter((m) => m.role === 'user').length;
      if (userMessageCount === 0) {
        generateTitleMutation.mutate({
          sessionId: currentSessionIdRef.current,
          message: content,
        });
      }

      // Get customer info
      const customer = getCustomerInfo();

      // Build SSE URL
      const params = new URLSearchParams({
        message: messageContent,
        session_id: currentSessionIdRef.current,
      });
      if (customer?.customer_id) {
        params.set('customer_id', customer.customer_id);
        params.set('customer_name', customer.name || '');
      }

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Add streaming assistant message
      const assistantMessageId = `msg_${Date.now()}_assistant`;
      currentMessageRef.current = '';
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isStreaming: true,
          toolCalls: [],
        },
      ]);

      try {
        const response = await fetch(`${API_BASE}/chat/stream?${params.toString()}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No response body');
        }

        let pendingContent = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                switch (data.type) {
                  case 'content':
                    currentMessageRef.current += data.data;
                    pendingContent = currentMessageRef.current;
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

                  case 'agent_decision':
                    setAgentDecisions((prev) => [
                      ...prev,
                      {
                        id: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        agent: data.agent,
                        decisionType: data.decision_type,
                        details: data.details,
                        summary: data.summary,
                        timestamp: new Date(),
                      },
                    ]);
                    break;

                  case 'sanction_letter':
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

                  case 'done':
                    setIsLoading(false);
                    setMessages((prev) => {
                      const updated = [...prev];
                      const lastMsg = updated[updated.length - 1];
                      if (lastMsg?.role === 'assistant') {
                        lastMsg.isStreaming = false;
                      }
                      return updated;
                    });
                    // Save assistant message
                    if (pendingContent) {
                      saveMessage('assistant', pendingContent);
                    }
                    break;

                  case 'error':
                    setIsLoading(false);
                    setMessages((prev) => {
                      const updated = [...prev];
                      const lastMsg = updated[updated.length - 1];
                      if (lastMsg?.role === 'assistant') {
                        lastMsg.content = `Error: ${data.message}`;
                        lastMsg.isStreaming = false;
                      }
                      return updated;
                    });
                    break;
                }
              } catch {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          console.log('SSE stream aborted');
          return;
        }
        console.error('SSE error:', error);
        setIsLoading(false);
        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg?.role === 'assistant') {
            lastMsg.content = 'Connection error. Please try again.';
            lastMsg.isStreaming = false;
          }
          return updated;
        });
      }
    },
    [
      messages.length,
      messages,
      createSessionMutation,
      saveMessage,
      generateTitleMutation,
      getCustomerInfo,
    ]
  );

  // Create new session - simple reset
  const newSession = useCallback(() => {
    // Abort any ongoing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Generate fresh session ID
    const freshId = `session_${Date.now()}`;
    setCurrentSessionId(freshId);
    currentSessionIdRef.current = freshId;

    // Reset all state
    setMessages([]);
    setAgentDecisions([]);
    setIsLoading(false);
    setCurrentToolCall(null);
    autoGreetSentRef.current = false;

    // Navigate to welcome screen
    onNavigate?.('/');
  }, [onNavigate]);

  // Load a session
  const loadSession = useCallback(
    (session: ChatSession) => {
      // Abort any ongoing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setCurrentSessionId(session.id);
      setMessages([]); // Clear messages so they load from query
      setAgentDecisions([]);
      onNavigate?.(`/chat/${session.id}`);
    },
    [onNavigate]
  );

  // Delete a session
  const deleteSession = useCallback(
    (sessionId: string) => {
      deleteSessionMutation.mutate(sessionId, {
        onSuccess: () => {
          if (sessionId === currentSessionId) {
            newSession();
          }
        },
      });
    },
    [currentSessionId, deleteSessionMutation, newSession]
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

  // Auto-greet user when they land from email link
  // Session is NOT created in App.tsx - we create it here when injecting the greeting
  useEffect(() => {
    const customer = getCustomerInfo();
    const isFromEmail = localStorage.getItem('fromEmailRedirect') === 'true';

    if (
      customer?.customer_id &&
      isFromEmail &&
      !autoGreetSentRef.current &&
      messages.length === 0 &&
      !isLoading
    ) {
      autoGreetSentRef.current = true;
      localStorage.removeItem('fromEmailRedirect');

      // Inject greeting immediately
      const greetingMessage: Message = {
        id: `msg_greeting_${Date.now()}`,
        role: 'assistant',
        content: `Hello ${customer.name || 'there'}! 👋\n\nWelcome to NBFC Personal Loans. I'm your digital loan assistant.\n\nGreat news — you've been **pre-approved** for a personal loan! I'm here to help you:\n\n• Calculate your EMI for any amount\n• Complete quick KYC verification\n• Get your loan sanctioned in minutes\n\nHow much loan amount are you looking for, and over what tenure?`,
        timestamp: new Date(),
        isStreaming: false,
        toolCalls: [],
      };
      setMessages([greetingMessage]);

      // Create session and save greeting (async, non-blocking)
      (async () => {
        try {
          await createSessionMutation.mutateAsync({
            sessionId: currentSessionIdRef.current,
            title: `Chat with ${customer.name || 'Customer'}`,
          });
          onNavigate?.(`/chat/${currentSessionIdRef.current}`);
          saveMessage('assistant', greetingMessage.content);
        } catch (e) {
          console.error('Failed to create session for greeting:', e);
        }
      })();
    }
  }, [messages.length, isLoading, getCustomerInfo, saveMessage, createSessionMutation, onNavigate]);

  // Clear agent decisions (for new sessions)
  const clearAgentDecisions = useCallback(() => {
    setAgentDecisions([]);
  }, []);

  return {
    messages,
    isConnected: true, // SSE doesn't need persistent connection
    isLoading,
    isLoadingSession,
    isLoadingSessions,
    currentToolCall,
    sessions,
    currentSessionId,
    agentDecisions,
    sendMessage,
    newSession,
    loadSession,
    deleteSession,
    fetchSessions: refetchSessions,
    connect: () => { }, // No-op for SSE
    disconnect: () => { }, // No-op for SSE
    clearAgentDecisions,
  };
}
