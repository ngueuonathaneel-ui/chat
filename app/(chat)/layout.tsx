/**
 * Layout Chat - Structure principale de l'application
 * 
 * Architecture:
 * - Sidebar responsive (mobile: hidden, desktop: 320px)
 * - Main content area flexible
 * - Socket provider pour real-time
 * - Protected route (middleware)
 */

import { SocketProvider } from '@/providers/SocketProvider';
import { ChatLayoutClient } from '@/components/layout/ChatLayoutClient';
import { getConversations } from '@/lib/api/conversations';
import { headers } from 'next/headers';

export const metadata = {
  title: 'Messenger - Conversations',
  description: 'Application de messagerie temps réel sécurisée',
};

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch conversations server-side for initial render
  const conversations = await getConversations();

  return (
    <SocketProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <ChatLayoutClient initialConversations={conversations}>
          {children}
        </ChatLayoutClient>
      </div>
    </SocketProvider>
  );
}
