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
