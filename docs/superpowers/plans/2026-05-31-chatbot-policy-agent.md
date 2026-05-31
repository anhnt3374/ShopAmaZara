# Chatbot Policy Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the in-app shopping assistant answer store-policy questions (shipping, privacy, terms, seller, support) by adding one `get_policies` tool, with no RAG.

**Architecture:** The chatbot is a single LangGraph ReAct agent whose tool selection acts as the message→scenario classifier. We add a new static-knowledge tool `get_policies` (the "Policy Agent" scenario from `chatbot.xlsx`) that returns the entire policy corpus (~600 words) as text, register it in the graph, and rewrite system-prompt Rule 7 from "refuse policy questions" to "answer from `get_policies`, cite the page, hand off to support if uncovered."

**Tech Stack:** NestJS 10, TypeScript, `@langchain/core` `DynamicStructuredTool`, `zod`, Jest.

---

## File Structure

- **Create** `backend/src/ai/knowledge/policies.ts` — canonical policy data (mirrors `frontend/src/pages/PolicyPage.jsx`) + `formatPoliciesForLLM()`.
- **Create** `backend/src/ai/knowledge/policies.spec.ts` — unit tests for the formatter.
- **Create** `backend/src/ai/graph/tools/get-policies.tool.ts` — the `get_policies` tool (no deps, no content block).
- **Create** `backend/src/ai/graph/tools/get-policies.tool.spec.ts` — unit tests for the tool.
- **Modify** `backend/src/ai/ai.module.ts` — register the tool in the `AI_GRAPH` factory.
- **Modify** `backend/src/ai/prompts/system.en.ts` — add capability + rewrite Rule 7.
- **Modify** `frontend/src/pages/PolicyPage.jsx` — add a sync-pointer comment (no behavior change).
- **Create** `docs/features/chatbot-policy-agent.md` — feature doc.
- **Modify** `docs/features/chatbot.md` — move Policy out of "Out of scope", add scenario + tool rows.
- **Modify** `docs/README.md` — add completed-feature row.

---

## Task 1: Policy knowledge module

**Files:**
- Create: `backend/src/ai/knowledge/policies.ts`
- Test: `backend/src/ai/knowledge/policies.spec.ts`

The 5 sections and copy are ported verbatim from `frontend/src/pages/PolicyPage.jsx` (sections array). Keep wording identical so the two copies stay in sync.

- [ ] **Step 1: Write the failing test**

Create `backend/src/ai/knowledge/policies.spec.ts`:

```ts
import {
  POLICY_SECTIONS,
  SUPPORT_CONTACT,
  formatPoliciesForLLM,
} from './policies';

describe('policy knowledge', () => {
  it('has the five published sections', () => {
    expect(POLICY_SECTIONS.map((s) => s.id).sort()).toEqual(
      ['privacy', 'shipping', 'support', 'terms', 'vendor'].sort(),
    );
  });

  it('formats every section with its page path', () => {
    const text = formatPoliciesForLLM();
    for (const s of POLICY_SECTIONS) {
      expect(text).toContain(s.title);
      expect(text).toContain(s.path); // e.g. /policy/shipping
    }
  });

  it('exposes the support contact and includes it in the formatted text', () => {
    expect(SUPPORT_CONTACT).toBe('support@amazara.com');
    expect(formatPoliciesForLLM()).toContain(SUPPORT_CONTACT);
  });

  it('includes concrete policy facts the agent must be able to cite', () => {
    const text = formatPoliciesForLLM();
    expect(text).toContain('1–3 business days'); // shipping
    expect(text).toContain('7 business days'); // privacy deletion
    expect(text).toContain('5–12%'); // seller commission
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/ai/knowledge/policies.spec.ts`
Expected: FAIL — `Cannot find module './policies'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/ai/knowledge/policies.ts`:

```ts
// AmaZara policy corpus for the chatbot "Policy Agent" scenario.
// SOURCE OF TRUTH MIRROR: keep this in sync with the `sections` array in
// frontend/src/pages/PolicyPage.jsx. Static policy copy is intentionally
// duplicated (no shared API) — edit both when policies change.

export type PolicyParagraph = { heading: string; body: string };

export type PolicySection = {
  id: string; // matches /policy/:section route param
  title: string;
  path: string; // '/policy/<id>'
  paragraphs: PolicyParagraph[];
};

export const SUPPORT_CONTACT = 'support@amazara.com';

export const POLICY_SECTIONS: PolicySection[] = [
  {
    id: 'privacy',
    title: 'Privacy Policy',
    path: '/policy/privacy',
    paragraphs: [
      {
        heading: 'Personal data collection',
        body: 'AmaZara only collects the data needed to complete transactions and improve the shopping experience. Sensitive data such as payment cards is encrypted and processed through PCI-DSS compliant partners.',
      },
      {
        heading: 'Your rights',
        body: 'You may access, update, or delete your personal data at any time under Settings → Privacy. Deletion requests are processed within 7 business days.',
      },
    ],
  },
  {
    id: 'terms',
    title: 'Terms of Service',
    path: '/policy/terms',
    paragraphs: [
      {
        heading: 'Account & security',
        body: 'You are responsible for keeping your password safe and for any activity that occurs under your account. AmaZara may temporarily suspend an account if suspicious behavior is detected.',
      },
      {
        heading: 'Prohibited conduct',
        body: 'Using the platform to sell counterfeit goods, infringe copyright, or commit fraud is strictly forbidden. Violations lead to permanent account suspension and may be referred to law enforcement.',
      },
    ],
  },
  {
    id: 'shipping',
    title: 'Shipping Guide',
    path: '/policy/shipping',
    paragraphs: [
      {
        heading: 'Delivery areas',
        body: 'AmaZara ships to 63 provinces across Vietnam and to more than 60 countries worldwide. Domestic delivery typically takes 1–3 business days; international delivery takes 5–14 days depending on the carrier.',
      },
      {
        heading: 'Shipping fees',
        body: 'Domestic orders over 500,000 VND ship free at the standard speed. Express and international rates are shown at checkout based on weight and destination.',
      },
    ],
  },
  {
    id: 'vendor',
    title: 'Seller Policy',
    path: '/policy/vendor',
    paragraphs: [
      {
        heading: 'Store registration',
        body: 'Sellers must provide a valid business license and proof-of-origin documentation for their products. Applications are reviewed within 3 business days.',
      },
      {
        heading: 'Commission policy',
        body: 'AmaZara charges a 5–12% service fee per order depending on the product category. The breakdown is shown transparently in the seller dashboard and reconciled weekly.',
      },
    ],
  },
  {
    id: 'support',
    title: 'Contact Support',
    path: '/policy/support',
    paragraphs: [
      {
        heading: 'Support channels',
        body: 'You can reach AmaZara via 24/7 live chat, email at support@amazara.com, or by phone at 1900 1234 during business hours.',
      },
      {
        heading: 'Response times',
        body: 'We aim to reply within 1 hour over chat and within 24 hours over email. Complaints are prioritized and resolved within 72 hours.',
      },
    ],
  },
];

export function formatPoliciesForLLM(): string {
  return POLICY_SECTIONS.map((s) => {
    const body = s.paragraphs
      .map((p) => `${p.heading}: ${p.body}`)
      .join('\n');
    return `## ${s.title}  (page: ${s.path})\n${body}`;
  }).join('\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/ai/knowledge/policies.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/knowledge/policies.ts backend/src/ai/knowledge/policies.spec.ts
git commit -m "feat(ai): add static policy knowledge module for Policy Agent"
```

---

## Task 2: `get_policies` tool

**Files:**
- Create: `backend/src/ai/graph/tools/get-policies.tool.ts`
- Test: `backend/src/ai/graph/tools/get-policies.tool.spec.ts`

The tool takes no args, returns the full policy text plus a steering note, and pushes **no** content block. It does not call `ctxFromConfig` (no userId needed).

- [ ] **Step 1: Write the failing test**

Create `backend/src/ai/graph/tools/get-policies.tool.spec.ts`:

```ts
import { makeGetPoliciesTool } from './get-policies.tool';
import { SUPPORT_CONTACT } from '../../knowledge/policies';

describe('get_policies tool', () => {
  it('is named get_policies', () => {
    expect(makeGetPoliciesTool().name).toBe('get_policies');
  });

  it('returns policy text and a grounding note, pushing no content block', async () => {
    const pushBlock = jest.fn();
    const tool = makeGetPoliciesTool();
    const out = await tool.invoke(
      {},
      {
        configurable: {
          userId: 'u1',
          conversationId: 'c1',
          pushBlock,
          getPendingPreorder: () => null,
          setPendingPreorder: () => undefined,
        },
      },
    );
    const parsed = JSON.parse(out);
    expect(parsed.policies).toContain('Shipping Guide');
    expect(parsed.policies).toContain('/policy/shipping');
    expect(parsed.note).toContain(SUPPORT_CONTACT);
    expect(pushBlock).not.toHaveBeenCalled();
  });

  it('is callable with no arguments', async () => {
    const tool = makeGetPoliciesTool();
    const out = await tool.invoke({}, { configurable: {} });
    expect(typeof out).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/ai/graph/tools/get-policies.tool.spec.ts`
Expected: FAIL — `Cannot find module './get-policies.tool'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/ai/graph/tools/get-policies.tool.ts`:

```ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatPoliciesForLLM, SUPPORT_CONTACT } from '../../knowledge/policies';

const Schema = z.object({});

export function makeGetPoliciesTool() {
  return new DynamicStructuredTool({
    name: 'get_policies',
    description:
      "Call this for any question about AmaZara's store policies or conditions — shipping/delivery times & fees, privacy & data, terms of service, seller/commission policy, or how to contact support. Returns the full published policy text. Answer ONLY from it.",
    schema: Schema,
    func: async () => {
      return JSON.stringify({
        policies: formatPoliciesForLLM(),
        note:
          'Answer ONLY from the policies above, in 1–2 short sentences. Cite the relevant page path (e.g. /policy/shipping). ' +
          `If the question is not covered by this text, say it is not in our published policies and tell the user to contact ${SUPPORT_CONTACT}. Do not invent policies.`,
      });
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/ai/graph/tools/get-policies.tool.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/graph/tools/get-policies.tool.ts backend/src/ai/graph/tools/get-policies.tool.spec.ts
git commit -m "feat(ai): add get_policies tool (Policy Agent scenario)"
```

---

## Task 3: Register the tool in the graph

**Files:**
- Modify: `backend/src/ai/ai.module.ts`

- [ ] **Step 1: Add the import**

In `backend/src/ai/ai.module.ts`, after the `makeSuggestSimilarTool` import (line ~29), add:

```ts
import { makeGetPoliciesTool } from './graph/tools/get-policies.tool';
```

- [ ] **Step 2: Register in the tools array**

In the `AI_GRAPH` `useFactory`, add `makeGetPoliciesTool()` as the last entry of the `tools` array (after `makeSuggestSimilarTool({ products })`):

```ts
        const tools = [
          makeSearchProductsTool({ products }),
          makeCompareProductsTool({ products }),
          makeAddToCartTool({ cart }),
          makeRemoveFromCartTool({ cart }),
          makeToggleWishlistTool({ wishlist }),
          makeCreatePreorderTool({ orders, registry }),
          makeConfirmOrderTool({ orders, registry }),
          makeCancelOrderTool({ orders }),
          makeLookupOrderTool({ orders }),
          makeSuggestSimilarTool({ products }),
          makeGetPoliciesTool(),
        ];
```

- [ ] **Step 3: Verify the module compiles and the AI suite passes**

Run: `cd backend && npx tsc --noEmit && npx jest src/ai`
Expected: tsc no errors; all AI specs pass (existing graph/agent specs don't assert a tool count, so they are unaffected).

- [ ] **Step 4: Commit**

```bash
git add backend/src/ai/ai.module.ts
git commit -m "feat(ai): register get_policies tool in the agent graph"
```

---

## Task 4: Rewrite system prompt Rule 7

**Files:**
- Modify: `backend/src/ai/prompts/system.en.ts`

This is prompt text — no automated test asserts its wording. Verification is `tsc` + manual smoke (Task 6). UI/agent output must stay English (CLAUDE.md).

- [ ] **Step 1: Add the capability line**

In `backend/src/ai/prompts/system.en.ts`, in the CAPABILITIES list, after the `suggest_similar` line, add:

```
- get_policies: fetch AmaZara's published store policies (shipping, privacy, terms, seller/commission, support contact) to answer policy questions.
```

- [ ] **Step 2: Replace Rule 7**

Replace the existing Rule 7:

```
7. If the user asks for something outside shopping (account settings, store policies, contacting support), politely say it's outside your scope and point them to the relevant page.
```

with:

```
7. For questions about store policies or conditions — shipping/delivery times & fees, privacy & data, terms of service, seller/commission policy, or how to contact support — call get_policies and answer in 1–2 short sentences using ONLY what it returns. Cite the relevant page (e.g. /policy/shipping). If the question is not covered by the returned policies, say it is not in our published policies and point the user to support@amazara.com. Do not invent policies. For non-policy requests outside shopping (e.g. changing account settings), politely say it's outside your scope and point them to the relevant page.
```

- [ ] **Step 3: Verify it compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/ai/prompts/system.en.ts
git commit -m "feat(ai): prompt agent to answer policy questions via get_policies"
```

---

## Task 5: Frontend sync-pointer comment

**Files:**
- Modify: `frontend/src/pages/PolicyPage.jsx`

No behavior change — just a comment so a future editor keeps both copies in sync.

- [ ] **Step 1: Add the comment**

In `frontend/src/pages/PolicyPage.jsx`, immediately above `const sections = [`, add:

```jsx
// SOURCE OF TRUTH MIRROR: the chatbot Policy Agent reads the same copy from
// backend/src/ai/knowledge/policies.ts. Edit both when policies change.
```

- [ ] **Step 2: Verify the frontend builds**

Run: `cd frontend && npx vite build`
Expected: build succeeds (no syntax error from the comment).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PolicyPage.jsx
git commit -m "docs(fe): note PolicyPage copy is mirrored in backend policy module"
```

---

## Task 6: Manual smoke test

**Files:** none (manual verification).

- [ ] **Step 1: Start the stack with the AI feature on**

Run:
```bash
cp backend/.env.example backend/.env   # ensure GROQ_API_KEY is set, AI_FEATURE_ENABLED=true
docker compose up -d
```

- [ ] **Step 2: Exercise the Policy Agent scenario**

Log in as a buyer in the SPA, open the AmaZara Assistant chat (bottom-right), and send each:
- "How long does domestic shipping take?" → expect a 1–2 sentence answer mentioning 1–3 business days and citing `/policy/shipping`. No product card.
- "What's the seller commission?" → expect mention of 5–12% and `/policy/vendor`.
- "What's your return/refund window?" → expect an admission it isn't in published policies plus a pointer to support@amazara.com (returns are not in the corpus).
- "find bluetooth headphones under 1 million" → expect the normal product list (confirm the shopping scenarios still work — no regression).

- [ ] **Step 3: No commit** (verification only).

---

## Task 7: Documentation

**Files:**
- Create: `docs/features/chatbot-policy-agent.md`
- Modify: `docs/features/chatbot.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Write the feature doc**

Create `docs/features/chatbot-policy-agent.md`:

```markdown
# Chatbot — Policy Agent

The "Policy Agent" scenario from `chatbot.xlsx`: the in-app assistant answers
questions about store policies and conditions (shipping, privacy, terms,
seller/commission, support contact).

## No RAG

`chatbot.xlsx` specifies the Policy Agent uses *static data, RAG only if there
is too much*. The published policy corpus (`frontend/src/pages/PolicyPage.jsx`,
5 sections, ~600 words) fits trivially in a single LLM context, so we load all
of it — no embeddings, no vector store, no retrieval.

## How it works

The chatbot's tool selection is its scenario classifier. We added one tool:

| Tool | Reads | Pushes | Behavior |
|------|-------|--------|----------|
| `get_policies` | `backend/src/ai/knowledge/policies.ts` (static) | nothing (text-only answer) | returns the full policy text + a grounding note |

System-prompt Rule 7 (`backend/src/ai/prompts/system.en.ts`) directs the agent
to call `get_policies`, answer in 1–2 sentences using only the returned text,
cite the relevant `/policy/<section>` page, and — if the topic isn't covered —
say so and point to support@amazara.com (the Human Handoff fallback).

## Source-of-truth note

Policy copy is duplicated: `policies.ts` (backend, for the agent) mirrors the
`sections` array in `frontend/src/pages/PolicyPage.jsx` (rendered page). Both
files carry a cross-reference comment; edit both when policies change.

## Manual checklist

- [ ] "How long does domestic shipping take?" → 1–2 sentence answer, cites /policy/shipping, no product card.
- [ ] "What's the seller commission?" → mentions 5–12%, cites /policy/vendor.
- [ ] "What's your return window?" → not-published + support@amazara.com.
- [ ] A product search still returns a products block (no regression).
```

- [ ] **Step 2: Update `docs/features/chatbot.md`**

(a) Remove the line `- Policy/FAQ RAG agent (sub-project B).` from the "Out of scope" section.

(b) In the scenarios table at the top, add a row:

```
| — | "how long does shipping take?" / "what's the commission?" | `get_policies` → text answer citing /policy/<section> |
```

(c) Change the Tools heading `## Tools (10)` to `## Tools (11)` and add a row to the tools table:

```
| `get_policies` | static `policies.ts` (no service) | nothing (text answer) |
```

- [ ] **Step 3: Update `docs/README.md`**

Add a row to the completed-features table (after the embedding-warmup row):

```
| 2026-05-31 | Chatbot — Policy Agent (policy Q&A, no RAG) | [features/chatbot-policy-agent.md](features/chatbot-policy-agent.md) |
```

- [ ] **Step 4: Commit**

```bash
git add docs/features/chatbot-policy-agent.md docs/features/chatbot.md docs/README.md
git commit -m "docs(chatbot): document Policy Agent scenario"
```

---

## Task 8: Full backend suite

**Files:** none.

- [ ] **Step 1: Run the full unit suite**

Run: `cd backend && npm test`
Expected: PASS — including the new `policies.spec.ts` and `get-policies.tool.spec.ts`, with no regressions in the existing AI specs.

- [ ] **Step 2: No commit** (verification only).
```
