import { AiConversation, AiMessage } from '../types/ai';

export interface AIService {
  getConversations(): Promise<AiConversation[]>;
  getMessages(conversationId: string): Promise<AiMessage[]>;
  createConversation(): Promise<AiConversation>;
  renameConversation(conversationId: string, title: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  sendMessage(conversationId: string, text: string): Promise<AiMessage[]>;
}
