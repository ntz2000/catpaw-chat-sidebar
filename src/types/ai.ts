export interface AiMessage { id: string; conversationId: string; role: 'user' | 'assistant'; text: string; timestamp: string; }
export interface AiConversation { id: string; title: string; updatedAt: string; }
