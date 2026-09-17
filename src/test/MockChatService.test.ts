import assert from 'node:assert/strict';
import test from 'node:test';

import { MockChatService } from '../services/MockChatService';

test('provides at least eight seeded messages for 张三', async () => {
  const service = new MockChatService();

  const messages = await service.getMessages('zhangsan');

  assert.ok(messages.length >= 8);
  assert.ok(messages.every((message) => message.conversationId === 'zhangsan'));
});

test('sending a message updates the conversation preview without adding unread count', async () => {
  const service = new MockChatService();

  const sent = await service.sendMessage('zhangsan', '晚上再说');
  const messages = await service.getMessages('zhangsan');
  const conversation = (await service.getConversations()).find((item) => item.id === 'zhangsan');

  assert.equal(sent.isSelf, true);
  assert.equal(sent.text, '晚上再说');
  assert.equal(messages.at(-1)?.id, sent.id);
  assert.equal(conversation?.lastMessage, '晚上再说');
  assert.equal(conversation?.unread, 2);
});

test('marking a conversation as read clears its unread count', async () => {
  const service = new MockChatService();

  await service.markAsRead('zhangsan');

  const conversation = (await service.getConversations()).find((item) => item.id === 'zhangsan');
  assert.equal(conversation?.unread, 0);
});
