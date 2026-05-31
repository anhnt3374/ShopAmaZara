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
