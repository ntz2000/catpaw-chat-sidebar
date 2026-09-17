import { AIService } from './AIService';
import { AiConversation, AiMessage } from '../types/ai';

interface AiStorage { get<T>(key: string): T | undefined; update<T>(key: string, value: T): Thenable<void> | Promise<void>; }
interface AiSnapshot { conversations: AiConversation[]; messages: AiMessage[]; }
const STORE_KEY = 'workspace.mockAi';

export class MockAIService implements AIService {
  private conversations: AiConversation[];
  private messages: AiMessage[];
  public constructor(private readonly storage?: AiStorage) {
    const saved = storage?.get<AiSnapshot>(STORE_KEY);
    this.conversations = saved?.conversations ?? [{ id: 'ai-1', title: '随便聊聊', updatedAt: '刚刚' }];
    this.messages = saved?.messages ?? [{ id: 'ai-welcome', conversationId: 'ai-1', role: 'assistant', text: '这是 Mock AI，目前还没有连接真实模型。', timestamp: '现在' }];
  }
  public async getConversations(): Promise<AiConversation[]> { return this.conversations.map((item) => ({ ...item })); }
  public async getMessages(id: string): Promise<AiMessage[]> { return this.messages.filter((item) => item.conversationId === id).map((item) => ({ ...item })); }
  public async createConversation(): Promise<AiConversation> { const item = { id: `ai-${Date.now()}`, title: '新对话', updatedAt: '刚刚' }; this.conversations.unshift(item); await this.persist(); return { ...item }; }
  public async renameConversation(id: string, title: string): Promise<void> { const item = this.find(id); item.title = title.trim() || item.title; await this.persist(); }
  public async deleteConversation(id: string): Promise<void> { this.conversations = this.conversations.filter((item) => item.id !== id); this.messages = this.messages.filter((item) => item.conversationId !== id); await this.persist(); }
  public async sendMessage(id: string, text: string): Promise<AiMessage[]> {
    const clean = text.trim(); if (!clean) return this.getMessages(id); const item = this.find(id); const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.messages.push({ id: `u-${Date.now()}`, conversationId: id, role: 'user', text: clean, timestamp: now });
    this.messages.push({ id: `a-${Date.now()}`, conversationId: id, role: 'assistant', text: reply(clean), timestamp: now });
    item.title = item.title === '新对话' ? clean.slice(0, 24) : item.title; item.updatedAt = now; await this.persist(); return this.getMessages(id);
  }
  private find(id: string): AiConversation { const item = this.conversations.find((value) => value.id === id); if (!item) throw new Error('AI conversation not found.'); return item; }
  private async persist(): Promise<void> { if (this.storage) await this.storage.update(STORE_KEY, { conversations: this.conversations, messages: this.messages }); }
}
function reply(text: string): string { const value = text.toLowerCase(); if (value.includes('论文')) return 'Mock AI：可以先梳理问题、方法、实验和结论四个部分。'; if (value.includes('代码')) return 'Mock AI：建议先缩小问题范围，再写一个最小可复现测试。'; if (value.includes('累')) return 'Mock AI：休息几分钟也许会让下一步更清晰。'; if (value.includes('hello') || text.includes('你好')) return '你好，这是一个本地 Mock 回复。'; return 'Mock AI 已收到。真实模型服务将在未来版本接入。'; }
