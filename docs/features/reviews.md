# Reviews

Product reviews (1–5 stars + optional comment). Buyer phải có ≥1 order Delivered
chứa product để được tạo review. Mỗi cặp `(user, product)` chỉ có 1 review;
owner toàn quyền sửa/xoá. Aggregate rating + count được tính on-the-fly trong
`GET /products/:id`.

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/products/:productId/reviews` | public | `?page=&limit=&sort=newest\|highest\|lowest&rating=1..5`. Trả `{items, total, page, limit, summary: {average, count, breakdown}}`. `summary` không bị `rating` filter ảnh hưởng. |
| GET | `/products/:productId/reviews/me` | JWT | `{ review: ReviewItem\|null, canReview: boolean }`. |
| POST | `/products/:productId/reviews` | JWT | `{rating: 1..5, comment?}`. 403 nếu không eligible, 409 nếu đã có review. |
| PATCH | `/reviews/:id` | JWT (owner) | `{rating?, comment?}`. 403 nếu khác owner. |
| DELETE | `/reviews/:id` | JWT (owner) | 204. |

`GET /products/:id` được mở rộng để trả `rating` (1 chữ số thập phân) + `reviewCount`.

## Schema

`reviews(id char(36), product_id char(36), user_id bigint, rating tinyint, comment text, created_at, updated_at)` —
UNIQUE `(product_id, user_id)`, INDEX `(product_id, created_at)`, INDEX `(user_id)`.

## Seed

```bash
docker compose up -d mysql
cd backend && npm run seed:reviews
```

Script đọc `backend/1200_sample_review.json` và gán random vào cặp `(buyer, product)`
có order Delivered chưa có review. Idempotent.
