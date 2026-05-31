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
