import { ChatService } from './ChatService';
import { Conversation, Message } from '../types/chat';

export type FetchFunction = typeof fetch;

export class HttpChatService implements ChatService {
  private readonly baseUrl: string;

  public constructor(
    baseUrl = 'http://127.0.0.1:17321',
    private readonly fetchFunction: FetchFunction = globalThis.fetch
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public async getConversations(): Promise<Conversation[]> {
    return this.request<Conversation[]>('/api/conversations', { method: 'GET' });
  }

  public async getMessages(conversationId: string): Promise<Message[]> {
    const query = new URLSearchParams({ conversationId });
    return this.request<Message[]>(`/api/messages?${query.toString()}`, { method: 'GET' });
  }

  public async sendMessage(conversationId: string, text: string): Promise<Message> {
    return this.request<Message>('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId, text })
    });
  }

  public async markAsRead(conversationId: string): Promise<void> {
    await this.request<unknown>('/api/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId })
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchFunction(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(`Chat bridge request failed with status ${response.status}.`);
    }
    return (await response.json()) as T;
  }
}
