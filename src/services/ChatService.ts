import { Conversation, Message } from '../types/chat';

export interface ChatService {
  getConversations(): Promise<Conversation[]>;
  getMessages(conversationId: string): Promise<Message[]>;
  sendMessage(conversationId: string, text: string): Promise<Message>;
  markAsRead(conversationId: string): Promise<void>;
}
