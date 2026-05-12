export const mockConversations = [
  {
    id: 'c1',
    store: 'AuraSound Official',
    avatar: 'https://picsum.photos/seed/aurastore/80/80',
    lastMessage: 'Your order has shipped! Tracking inside.',
    unread: 2,
    updatedAt: '2 min',
  },
  {
    id: 'c2',
    store: 'ChronoSync Studio',
    avatar: 'https://picsum.photos/seed/chronostore/80/80',
    lastMessage: 'Yes, the leather strap is replaceable.',
    unread: 0,
    updatedAt: '1 h',
  },
  {
    id: 'c3',
    store: 'AmaZara Support',
    avatar: 'https://picsum.photos/seed/support/80/80',
    lastMessage: 'We have refunded $24.50 to your original payment method.',
    unread: 0,
    updatedAt: '3 h',
  },
  {
    id: 'c4',
    store: 'Lumen',
    avatar: 'https://picsum.photos/seed/lumen/80/80',
    lastMessage: 'Restock expected on the 27th.',
    unread: 1,
    updatedAt: '1 d',
  },
];

export function mockMessages(conversationId) {
  const base = [
    { id: 1, from: 'store', text: 'Hi! How can we help today?', at: '10:02' },
    { id: 2, from: 'user', text: 'I have a question about my AuraSound Pro order.', at: '10:03' },
    { id: 3, from: 'store', text: 'Of course — your order #NX-1098 is being prepared and will ship within 24 hours.', at: '10:04' },
    {
      id: 4,
      from: 'store',
      text: 'Here is the item you asked about:',
      at: '10:04',
      attachment: {
        type: 'product',
        title: 'AuraSound Pro ANC',
        price: '$249.99',
        image: 'https://picsum.photos/seed/aurasound/200/200',
      },
    },
    { id: 5, from: 'user', text: 'Great, thank you!', at: '10:05' },
  ];
  return base.map((m) => ({ ...m, conversationId }));
}

export const mockFaqs = [
  {
    id: 1,
    q: 'How do I track my order?',
    a: 'Open the AmaZara app, go to Orders, and tap your order to view real-time tracking.',
  },
  {
    id: 2,
    q: 'What is the return window?',
    a: 'You have 30 days from delivery to start a return. Items must be in original condition.',
  },
  {
    id: 3,
    q: 'How do I contact a seller?',
    a: 'On any product page, tap "Chat with seller" or use the Messages tab in your account.',
  },
  {
    id: 4,
    q: 'Does AmaZara ship internationally?',
    a: 'Yes — we ship to 60+ countries. Shipping fees are calculated at checkout.',
  },
  {
    id: 5,
    q: 'Are payments secure?',
    a: 'All transactions are protected by SSL and PCI-DSS-compliant processors.',
  },
];
