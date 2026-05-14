import { Review } from '../review.entity';

export interface ReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string };
}

export interface ReviewUserRef {
  id: string;
  fullName: string;
}

export function toReviewItem(r: Review, user: ReviewUserRef): ReviewItem {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    user: { id: String(user.id), name: user.fullName },
  };
}
