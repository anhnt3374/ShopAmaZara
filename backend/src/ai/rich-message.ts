export type ProductItem = {
  id: string;
  name: string;
  price: string;
  image: string | null;
  rating?: number;
  storeName?: string;
  stock?: 'in_stock' | 'low' | 'out';
  actions: Array<'view' | 'wishlist' | 'add_to_cart'>;
};

export type ConfirmCardLine = { label: string; value: string };

export type ContentBlock =
  | { type: 'products'; mode?: 'list' | 'compare' | 'upsell'; items: ProductItem[] }
  | {
      type: 'confirm_card';
      preorderId: string;
      title: string;
      lines: ConfirmCardLine[];
      total: ConfirmCardLine;
      primary: { label: string; action: 'confirm_order' };
      secondary: { label: string; action: 'cancel_order' };
      chips: { label: string; action: 'edit_address' | 'edit_qty' | 'edit_payment' }[];
    }
  | { type: 'order_success'; orderId: string; total: string }
  | { type: 'orders'; items: { id: string; status: string; total: string; createdAt: string }[] }
  | { type: 'toast'; kind: 'success' | 'info' | 'warn'; text: string };
