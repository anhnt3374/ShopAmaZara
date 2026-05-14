# Reviews CRUD — design

**Date:** 2026-05-14
**Status:** Approved (pending implementation)
**Scope:** Backend module + frontend integration on `ProductDetailPage`, plus a seed script for `backend/1200_sample_review.json`.

## Goal

Cho phép buyer đã mua sản phẩm (có order ở trạng thái `Delivered` chứa product) viết 1 review (rating 1–5 sao + comment) cho product đó, sửa hoặc xoá review của mình. Bất kỳ ai cũng xem được list review và rating trung bình trên product detail.

## Non-goals (v1)

- Review cho store hoặc cho seller (chỉ review product).
- Moderation / report / hide review từ phía seller hoặc admin.
- Reply từ seller cho review.
- Upload ảnh trong review.
- Helpful votes / verified-purchase badge bên cạnh review.
- Time-limit edit/delete.

## Decisions (locked)

| Quyết định | Giá trị |
|---|---|
| Eligibility | Chỉ buyer có ≥1 order Delivered chứa product |
| Per-user limit | 1 review duy nhất cho mỗi `(user, product)` |
| Edit/delete | Owner full control, không giới hạn thời gian, không seller intervention |
| Aggregate rating | Tính on-the-fly khi `GET /products/:id` (LEFT JOIN AVG/COUNT) |
| Sample JSON usage | Seed dev script gán random vào cặp `(buyer, product)` có order Delivered |
| FE entry points | Chỉ trong `ProductDetailPage` (list + form viết/edit/delete inline) |

---

## Data model

**Bảng mới `reviews`** — TypeORM entity `Review` (`backend/src/reviews/review.entity.ts`):

| Cột | Kiểu | Note |
|---|---|---|
| `id` | `char(36)` PK | UUID v4 (theo pattern của `products`) |
| `product_id` | `char(36)` | FK `products(id)` ON DELETE CASCADE, **index** |
| `user_id` | `bigint unsigned` | FK `users(id)` ON DELETE CASCADE, **index** (User.id là `bigint`) |
| `rating` | `tinyint unsigned` | 1..5, validated ở DTO |
| `comment` | `text` | nullable, ≤ 2000 ký tự |
| `created_at` | `timestamp` | auto |
| `updated_at` | `timestamp` | auto |

Indexes:
- `UNIQUE (product_id, user_id)` — chốt rule "1 review / (user, product)".
- `INDEX (product_id, created_at DESC)` — list reviews paginated by newest.
- `INDEX (user_id)` — dùng sau cho "my reviews".

Không cache `rating_avg` / `review_count` trên bảng `products`. Không cột `order_id`.

---

## API endpoints

Module mới `backend/src/reviews/`. Controllers split theo route shape:
- `ProductReviewsController` cho route lồng `/products/:productId/reviews*`.
- `ReviewsController` cho route flat `/reviews/:id`.

| Method | Path | Auth | Body / Query | Behavior |
|---|---|---|---|---|
| `GET` | `/products/:productId/reviews` | public | `?page=1&limit=10&sort=newest\|highest\|lowest&rating=1..5` | Paginated list. Trả `{ items, total, page, limit, summary: { average, count, breakdown: {1..5: count} } }`. `summary` luôn tính trên **toàn bộ** reviews của product (không bị filter `rating` ảnh hưởng). |
| `GET` | `/products/:productId/reviews/me` | JWT | — | Trả `{ review: ReviewItem \| null, canReview: boolean }`. `canReview` = đủ điều kiện và chưa có review. |
| `POST` | `/products/:productId/reviews` | JWT | `{ rating: 1..5, comment?: string }` | Tạo review. 403 nếu không eligible. 409 nếu đã có review (DB unique). |
| `PATCH` | `/reviews/:id` | JWT | `{ rating?, comment? }` | Chỉ owner. 403 nếu khác user. 404 nếu không tồn tại. |
| `DELETE` | `/reviews/:id` | JWT | — | Chỉ owner. 204. |

**Sort behavior:**
- `newest` (default): `ORDER BY created_at DESC`.
- `highest`: `ORDER BY rating DESC, created_at DESC`.
- `lowest`: `ORDER BY rating ASC, created_at DESC`.

**Mở rộng `GET /products/:id`:** response thêm 2 field:
- `rating: number` — `AVG(rating)` làm tròn 1 chữ số thập phân, hoặc `0` nếu chưa có review.
- `reviewCount: number` — `COUNT(*)`.

Implement bằng subquery `LEFT JOIN (SELECT product_id, AVG(rating) avg, COUNT(*) cnt FROM reviews GROUP BY product_id) r ON r.product_id = p.id`. Chỉ 1 row → không N+1.

**Response shape `ReviewItem`:**
```json
{
  "id": "uuid",
  "rating": 5,
  "comment": "Great product!",
  "createdAt": "2026-05-14T10:00:00Z",
  "updatedAt": "2026-05-14T10:00:00Z",
  "user": { "id": "uuid", "name": "Anh N." }
}
```
`user.name` lấy từ `users.full_name`, expose dưới key `name` trong response. Không lộ email/phone.

**Validation DTOs:**
- `CreateReviewDto`: `rating` integer 1..5 required, `comment` optional string ≤ 2000 chars, trimmed.
- `UpdateReviewDto`: cả 2 optional, validate cùng rule khi present.

---

## Eligibility & ownership logic

Gom vào `ReviewsService` (`backend/src/reviews/reviews.service.ts`). Inject `Repository<OrderItem>` (hoặc `Repository<Order>` join) qua TypeORM.

**Eligibility check:**

```ts
async canUserReview(userId: string, productId: string): Promise<boolean> {
  const count = await orderItems.createQueryBuilder('oi')
    .innerJoin('orders', 'o', 'o.id = oi.order_id')
    .where('oi.product_id = :productId', { productId })
    .andWhere('o.buyer_id = :userId', { userId })
    .andWhere("o.status = 'Delivered'")
    .getCount();
  return count > 0;
}
```

**POST flow:**
1. `canUserReview` → false ⇒ `403 Forbidden`, message `"You can only review products from a delivered order"`.
2. Insert review (`id = randomUUID()`). Bắt `QueryFailedError` với code `ER_DUP_ENTRY` ⇒ `409 Conflict`, message `"You have already reviewed this product"`.
3. Trả review với `user.name`.

**PATCH/DELETE flow:**
1. Load review by id; 404 nếu không tồn tại.
2. `review.userId !== currentUser.id` ⇒ `403 Forbidden`.
3. PATCH: update only fields present in body, `updated_at` auto bump.
4. DELETE: hard delete (không soft-delete, không có moderation queue).

**Không** check eligibility ở PATCH — tránh edge case user mất quyền edit chính review của mình nếu data order về sau thay đổi.

**Edge cases:**
- Buyer huỷ order sau khi đã review → review giữ nguyên (đã ghi nhận trải nghiệm thực).
- Product hard-deleted → FK CASCADE xoá review.
- User hard-deleted → FK CASCADE xoá review.

---

## Frontend integration

**Service mới `frontend/src/services/reviews.js`:**

```js
import { api } from './api';

export const reviewsService = {
  list: (productId, params) => api.get(`/products/${productId}/reviews`, { params }),
  myReview: (productId) => api.get(`/products/${productId}/reviews/me`),
  create: (productId, body) => api.post(`/products/${productId}/reviews`, body),
  update: (id, body) => api.patch(`/reviews/${id}`, body),
  remove: (id) => api.delete(`/reviews/${id}`),
};
```

**Sửa `ProductDetailPage.jsx`:**

Trang đã có placeholder dùng `product.rating`, `product.reviewCount`, `product.reviews[]`. Thay đổi:

1. `product.rating` / `product.reviewCount` — BE đã trả qua `GET /products/:id` (mở rộng ở trên). UI giữ nguyên.
2. `product.reviews` (mock) → bỏ. Thay bằng state load từ `reviewsService.list(productId)`:
   ```js
   const [reviewsState, setReviewsState] = useState({ items: [], total: 0, summary: null });
   const [reviewsPage, setReviewsPage] = useState(1);
   const [reviewsSort, setReviewsSort] = useState('newest');
   const [reviewsRatingFilter, setReviewsRatingFilter] = useState(null);
   const [myReview, setMyReview] = useState(null);
   const [canReview, setCanReview] = useState(false);
   const [isEditingMine, setIsEditingMine] = useState(false);
   ```
3. Khi `productId` thay đổi: load song song `reviewsService.list(productId, { page: 1, limit: 10 })` và (nếu đã login) `reviewsService.myReview(productId)`.

**UI blocks** (inline trong `ProductDetailPage`, không tách file mới):

| Block | Điều kiện render |
|---|---|
| Review summary (avg + 5-bar breakdown) | Luôn render khi có `summary` |
| My review card (rating + comment + Edit / Delete) | `myReview != null` |
| Form viết review (5 sao + textarea + submit) | `canReview && !myReview` |
| Form edit review (giống form viết, prefilled) | `myReview && isEditingMine` |
| Sort + rating filter selects | `total > 0` |
| List reviews của người khác + nút "Load more" | `total > 0` |

**Pagination:** "Load more" — page +1, append vào `items`. Đơn giản hơn pagination số trang.

**Sort + filter:** đổi giá trị ⇒ reset `page = 1`, gọi lại.

**Optimistic updates:** không. Sau mỗi POST/PATCH/DELETE: refetch list page 1 + myReview + product detail (cho `rating`/`reviewCount` cập nhật).

**Auth gate:** nếu chưa login mà bấm submit ⇒ `navigate('/auth', { state: { from: '/products/:id' } })` (pattern hiện có ở `CartPage`).

---

## Seed script

**File mới `backend/scripts/seed-reviews.ts`** — theo pattern `seed-products.ts` hiện có.

Input: `backend/1200_sample_review.json` (fixed path; tham số `--file` optional override).

Thuật toán:
1. Bootstrap `NestFactory.createApplicationContext(AppModule)`, lấy `DataSource`.
2. Load danh sách cặp eligible:
   ```sql
   SELECT DISTINCT o.buyer_id AS user_id, oi.product_id
   FROM orders o
   JOIN order_items oi ON oi.order_id = o.id
   WHERE o.status = 'Delivered';
   ```
3. Loại các cặp đã có review (LEFT JOIN `reviews`).
4. Load + shuffle sample JSON.
5. Duyệt từng entry, pop 1 cặp từ `eligiblePairs`, insert review `{ id, product_id, user_id, rating: label, comment: review }`.
6. Stop khi hết JSON hoặc hết `eligiblePairs`. Log số đã insert + warning nếu skip.

**Idempotency:** Bước 3 + unique constraint ⇒ chạy lại chỉ seed cặp còn trống.

**Thiếu data eligible:** Log warning `"Only X eligible (buyer, product) pairs; remaining N reviews skipped"`. Không bịa data, không tự tạo orders.

**Bulk insert:** batch 200 row/`repository.insert()` call.

**Npm script:**
```json
"seed:reviews": "ts-node -P scripts/tsconfig.json scripts/seed-reviews.ts"
```

---

## Testing

**Backend unit (`reviews.service.spec.ts`):**

| Test | Behavior |
|---|---|
| `canUserReview` returns true | Khi count ≥ 1 |
| `canUserReview` returns false | Khi count = 0 |
| `create` succeeds | Eligible, insert, trả review với `user.name` |
| `create` throws 403 | Không eligible |
| `create` throws 409 | Mock `ER_DUP_ENTRY` từ DB |
| `update` succeeds | Owner patch |
| `update` throws 403 | Khác owner |
| `update` throws 404 | Không tồn tại |
| `remove` succeeds | Owner |
| `remove` throws 403 | Khác owner |
| `listForProduct` | Trả `items`, `total`, `summary` chính xác |
| `summary` không phụ thuộc `rating` filter | Pass `rating=5`, `summary.count` vẫn là tổng |

**Backend e2e (`test/reviews.e2e-spec.ts`)** chạy với `amazara_test` schema:

Setup: 2 users (`buyerA`, `buyerB`), 1 store, 2 products (`pA`, `pB`), 1 order Delivered của `buyerA` chứa `pA`.

| Flow | Assert |
|---|---|
| `POST /products/pA/reviews` (buyerA) | 201, review trả `user.name` |
| `POST /products/pA/reviews` lại (buyerA) | 409 |
| `POST /products/pB/reviews` (buyerA) | 403 |
| `POST /products/pA/reviews` (buyerB) | 403 |
| `GET /products/pA/reviews` | 200, `total = 1`, `summary.average = rating` |
| `GET /products/pA/reviews/me` (buyerA) | review của A, `canReview = false` |
| `GET /products/pA/reviews/me` (buyerB) | `review = null`, `canReview = false` |
| `PATCH /reviews/:id` (buyerB) | 403 |
| `PATCH /reviews/:id` (buyerA) | 200 |
| `DELETE /reviews/:id` (buyerB) | 403 |
| `DELETE /reviews/:id` (buyerA) | 204 |
| `GET /products/pA` sau khi có review | response chứa `rating` + `reviewCount` đúng |

**Seed script:** smoke test thủ công (`npm run seed:reviews`).

**Frontend:** chưa có test harness — verify thủ công theo flow trong `docs/features/reviews.md`.

---

## Migrations / data

- Tạo bảng `reviews` qua TypeORM sync (project hiện đang dùng `synchronize: true` theo các module hiện có; xác nhận trong `app.module.ts` khi implement). Nếu có migration thủ công, thêm file dưới `backend/src/migrations/` (nếu directory này chưa có thì tạo theo convention TypeORM).
- Không migration trên bảng `products` (không thêm cột).

## Documentation

- Tạo `docs/features/reviews.md` summary endpoints + run instructions.
- Thêm row vào `docs/README.md` completed-features table khi implement xong.
