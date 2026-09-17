import { ChatService } from './ChatService';
import { Conversation, Message } from '../types/chat';

const SELF_NAME = '我';

export class MockChatService implements ChatService {
  private readonly conversations: Conversation[] = [
    { id: 'zhangsan', name: '张三', unread: 2, lastMessage: '你今天几点走？', timestamp: '14:32' },
    { id: 'lisi', name: '李四', unread: 0, lastMessage: '好的', timestamp: '13:17' },
    { id: 'lab-group', name: '实验室群', unread: 5, lastMessage: '王xx：明天十点开会', timestamp: '12:50' },
    { id: 'file-transfer', name: '文件传输助手', unread: 0, lastMessage: 'test.pdf', timestamp: '11:10' }
  ];

  private readonly messages: Message[] = [
    { id: 'zs-1', conversationId: 'zhangsan', sender: '张三', text: '你还在公司吗？', timestamp: '13:46', isSelf: false },
    { id: 'zs-2', conversationId: 'zhangsan', sender: SELF_NAME, text: '还在。', timestamp: '13:47', isSelf: true },
    { id: 'zs-3', conversationId: 'zhangsan', sender: '张三', text: '今天几点走？', timestamp: '13:48', isSelf: false },
    { id: 'zs-4', conversationId: 'zhangsan', sender: SELF_NAME, text: '估计晚一点。', timestamp: '13:49', isSelf: true },
    { id: 'zs-5', conversationId: 'zhangsan', sender: '张三', text: '吃饭了吗？', timestamp: '14:03', isSelf: false },
    { id: 'zs-6', conversationId: 'zhangsan', sender: SELF_NAME, text: '还没有，等会儿去。', timestamp: '14:05', isSelf: true },
    { id: 'zs-7', conversationId: 'zhangsan', sender: '张三', text: '要不要一起点？', timestamp: '14:21', isSelf: false },
    { id: 'zs-8', conversationId: 'zhangsan', sender: SELF_NAME, text: '可以啊。', timestamp: '14:23', isSelf: true },
    { id: 'zs-9', conversationId: 'zhangsan', sender: '张三', text: '你今天几点走？', timestamp: '14:32', isSelf: false },
    { id: 'ls-1', conversationId: 'lisi', sender: '李四', text: '下午的文档我已经补完了。', timestamp: '13:15', isSelf: false },
    { id: 'ls-2', conversationId: 'lisi', sender: SELF_NAME, text: '好的', timestamp: '13:17', isSelf: true },
    { id: 'lab-1', conversationId: 'lab-group', sender: '陈同学', text: '投影仪已经预约好了。', timestamp: '12:36', isSelf: false },
    { id: 'lab-2', conversationId: 'lab-group', sender: '王xx', text: '明天十点开会', timestamp: '12:50', isSelf: false },
    { id: 'file-1', conversationId: 'file-transfer', sender: '文件传输助手', text: 'test.pdf', timestamp: '11:10', isSelf: false }
  ];

  public async getConversations(): Promise<Conversation[]> {
    return this.conversations.map((conversation) => ({ ...conversation }));
  }

  public async getMessages(conversationId: string): Promise<Message[]> {
    this.requireConversation(conversationId);
    return this.messages
      .filter((message) => message.conversationId === conversationId)
      .map((message) => ({ ...message }));
  }

  public async sendMessage(conversationId: string, text: string): Promise<Message> {
    const conversation = this.requireConversation(conversationId);
    const trimmedText = text.trim();

    if (!trimmedText) {
      throw new Error('Message text cannot be empty.');
    }

    const timestamp = this.currentTime();
    const message: Message = {
      id: `message-${Date.now()}-${this.messages.length + 1}`,
      conversationId,
      sender: SELF_NAME,
      text: trimmedText,
      timestamp,
      isSelf: true
    };

    this.messages.push(message);
    conversation.lastMessage = trimmedText;
    conversation.timestamp = timestamp;

    return { ...message };
  }

  public async markAsRead(conversationId: string): Promise<void> {
    const conversation = this.requireConversation(conversationId);
    conversation.unread = 0;
  }

  private requireConversation(conversationId: string): Conversation {
    const conversation = this.conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    return conversation;
  }

  private currentTime(): string {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());
  }
}
