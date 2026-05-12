import { createBrowserRouter } from 'react-router-dom';
import UserLayout from './layouts/UserLayout.jsx';
import StoreLayout from './layouts/StoreLayout.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';
import HomePage from './pages/HomePage.jsx';
import ProductDetailPage from './pages/ProductDetailPage.jsx';
import SearchResultPage from './pages/SearchResultPage.jsx';
import CartPage from './pages/CartPage.jsx';
import WishlistPage from './pages/WishlistPage.jsx';
import UserChatPage from './pages/UserChatPage.jsx';
import PolicyPage from './pages/PolicyPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import StoreInventoryPage from './pages/store/StoreInventoryPage.jsx';
import StoreOrderManagementPage from './pages/store/StoreOrderManagementPage.jsx';
import StoreChatPage from './pages/store/StoreChatPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export const router = createBrowserRouter([
  {
    element: <UserLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/search', element: <SearchResultPage /> },
      { path: '/product/:id', element: <ProductDetailPage /> },
      { path: '/cart', element: <CartPage /> },
      { path: '/wishlist', element: <WishlistPage /> },
      { path: '/messages', element: <UserChatPage /> },
      { path: '/messages/:conversationId', element: <UserChatPage /> },
      { path: '/policy', element: <PolicyPage /> },
      { path: '/policy/:section', element: <PolicyPage /> },
    ],
  },
  {
    element: <StoreLayout />,
    children: [
      { path: '/store', element: <StoreOrderManagementPage /> },
      { path: '/store/orders', element: <StoreOrderManagementPage /> },
      { path: '/store/inventory', element: <StoreInventoryPage /> },
      { path: '/store/messages', element: <StoreChatPage /> },
    ],
  },
  {
    element: <AuthLayout />,
    children: [{ path: '/auth', element: <AuthPage /> }],
  },
  { path: '*', element: <NotFoundPage /> },
]);
