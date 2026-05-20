import { Injectable } from '@nestjs/common';
import type { PreorderDraft } from '../orders/orders.service';

/**
 * Process-local store for draft orders that survive across chat turns.
 *
 * Why this exists: when the agent calls `create_preorder` in turn N the draft
 * needs to be available again in turn N+1 (the turn where the user clicks
 * Confirm). Storing it on the AiService request-scope closure (the original
 * approach) loses it the moment respond() returns. Stashing it in the
 * graph state would require routing it through the checkpointer which is
 * overkill for v1 — a Map keyed by preorderId with the same 10-minute TTL
 * the draft already carries does the job.
 */
@Injectable()
export class PreorderRegistry {
  private readonly drafts = new Map<string, PreorderDraft>();

  put(draft: PreorderDraft): void {
    this.drafts.set(draft.preorderId, draft);
  }

  get(preorderId: string): PreorderDraft | null {
    const d = this.drafts.get(preorderId);
    if (!d) return null;
    if (Date.now() > d.expiresAt) {
      this.drafts.delete(preorderId);
      return null;
    }
    return d;
  }

  delete(preorderId: string): void {
    this.drafts.delete(preorderId);
  }
}
