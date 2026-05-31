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
        body: `You can reach AmaZara via 24/7 live chat, email at ${SUPPORT_CONTACT}, or by phone at 1900 1234 during business hours.`,
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
