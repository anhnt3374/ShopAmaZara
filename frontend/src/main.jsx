import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { WishlistProvider } from './context/WishlistContext.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CartProvider>
      <WishlistProvider>
        <ChatProvider>
          <RouterProvider router={router} />
        </ChatProvider>
      </WishlistProvider>
    </CartProvider>
  </React.StrictMode>,
);
