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
