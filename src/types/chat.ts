export interface Conversation {
  id: string;
  name: string;
  unread: number;
  lastMessage: string;
  timestamp: string;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: string;
  text: string;
  timestamp: string;
  isSelf: boolean;
}
