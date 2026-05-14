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

export interface ReviewSummary {
  average: number;
  count: number;
  breakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface ReviewListResult {
  items: ReviewItem[];
  total: number;
  page: number;
  limit: number;
  summary: ReviewSummary;
}

export interface MyReviewResult {
  review: ReviewItem | null;
  canReview: boolean;
}
