import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpChatService } from '../services/HttpChatService';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function createFetch(responseBody: unknown, calls: FetchCall[]): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
}

test('requests conversations from the documented endpoint', async () => {
  const calls: FetchCall[] = [];
  const service = new HttpChatService('http://chat.test', createFetch([], calls));

  await service.getConversations();

  assert.deepEqual(calls, [{ url: 'http://chat.test/api/conversations', init: { method: 'GET' } }]);
});

test('encodes the conversation id when requesting messages', async () => {
  const calls: FetchCall[] = [];
  const service = new HttpChatService('http://chat.test', createFetch([], calls));

  await service.getMessages('实验室 群');

  assert.equal(calls[0]?.url, 'http://chat.test/api/messages?conversationId=%E5%AE%9E%E9%AA%8C%E5%AE%A4+%E7%BE%A4');
  assert.equal(calls[0]?.init?.method, 'GET');
});

test('sends the documented JSON payload', async () => {
  const calls: FetchCall[] = [];
  const response = {
    id: 'message-1',
    conversationId: 'zhangsan',
    sender: '我',
    text: '晚上再说',
    timestamp: '18:30',
    isSelf: true
  };
  const service = new HttpChatService('http://chat.test', createFetch(response, calls));

  const message = await service.sendMessage('zhangsan', '晚上再说');

  assert.deepEqual(message, response);
  assert.equal(calls[0]?.url, 'http://chat.test/api/send');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.deepEqual(calls[0]?.init?.headers, { 'content-type': 'application/json' });
  assert.equal(calls[0]?.init?.body, JSON.stringify({ conversationId: 'zhangsan', text: '晚上再说' }));
});

test('marks a conversation as read through the documented endpoint', async () => {
  const calls: FetchCall[] = [];
  const service = new HttpChatService('http://chat.test', createFetch({}, calls));

  await service.markAsRead('zhangsan');

  assert.equal(calls[0]?.url, 'http://chat.test/api/read');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(calls[0]?.init?.body, JSON.stringify({ conversationId: 'zhangsan' }));
});
