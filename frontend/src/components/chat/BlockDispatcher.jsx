import { ProductListBlock } from './ProductListBlock';
import { ConfirmCardBlock } from './ConfirmCardBlock';
import { OrderSuccessBlock } from './OrderSuccessBlock';
import { OrdersListBlock } from './OrdersListBlock';
import { ToastBlock } from './ToastBlock';

export function BlockDispatcher({ block, conversationId, compact = false }) {
  switch (block?.type) {
    case 'products':
      return (
        <ProductListBlock
          block={block}
          conversationId={conversationId}
          compact={compact}
        />
      );
    case 'confirm_card':
      return <ConfirmCardBlock block={block} conversationId={conversationId} />;
    case 'order_success':
      return <OrderSuccessBlock block={block} />;
    case 'orders':
      return <OrdersListBlock block={block} />;
    case 'toast':
      return <ToastBlock block={block} />;
    default:
      return null;
  }
}
