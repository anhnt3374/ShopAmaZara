import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

const sections = [
  {
    id: 'privacy',
    title: 'Privacy Policy',
    icon: 'shield_lock',
    content: [
      {
        heading: 'Personal data collection',
        body:
          'AmaZara only collects the data needed to complete transactions and improve the shopping experience. Sensitive data such as payment cards is encrypted and processed through PCI-DSS compliant partners.',
      },
      {
        heading: 'Your rights',
        body:
          'You may access, update, or delete your personal data at any time under Settings → Privacy. Deletion requests are processed within 7 business days.',
      },
    ],
  },
  {
    id: 'terms',
    title: 'Terms of Service',
    icon: 'gavel',
    content: [
      {
        heading: 'Account & security',
        body:
          'You are responsible for keeping your password safe and for any activity that occurs under your account. AmaZara may temporarily suspend an account if suspicious behavior is detected.',
      },
      {
        heading: 'Prohibited conduct',
        body:
          'Using the platform to sell counterfeit goods, infringe copyright, or commit fraud is strictly forbidden. Violations lead to permanent account suspension and may be referred to law enforcement.',
      },
    ],
  },
  {
    id: 'shipping',
    title: 'Shipping Guide',
    icon: 'local_shipping',
    content: [
      {
        heading: 'Delivery areas',
        body:
          'AmaZara ships to 63 provinces across Vietnam and to more than 60 countries worldwide. Domestic delivery typically takes 1–3 business days; international delivery takes 5–14 days depending on the carrier.',
      },
      {
        heading: 'Shipping fees',
        body:
          'Domestic orders over 500,000 VND ship free at the standard speed. Express and international rates are shown at checkout based on weight and destination.',
      },
    ],
  },
  {
    id: 'vendor',
    title: 'Seller Policy',
    icon: 'storefront',
    content: [
      {
        heading: 'Store registration',
        body:
          'Sellers must provide a valid business license and proof-of-origin documentation for their products. Applications are reviewed within 3 business days.',
      },
      {
        heading: 'Commission policy',
        body:
          'AmaZara charges a 5–12% service fee per order depending on the product category. The breakdown is shown transparently in the seller dashboard and reconciled weekly.',
      },
    ],
  },
  {
    id: 'support',
    title: 'Contact Support',
    icon: 'support_agent',
    content: [
      {
        heading: 'Support channels',
        body:
          'You can reach AmaZara via 24/7 live chat, email at support@amazara.com, or by phone at 1900 1234 during business hours.',
      },
      {
        heading: 'Response times',
        body:
          'We aim to reply within 1 hour over chat and within 24 hours over email. Complaints are prioritized and resolved within 72 hours.',
      },
    ],
  },
];

export default function PolicyPage() {
  const { section } = useParams();
  const active = useMemo(
    () => sections.find((s) => s.id === section) ?? sections[0],
    [section],
  );

  return (
    <div className="container-max py-8 grid grid-cols-1 lg:grid-cols-12 gap-gutter">
      {/* Sticky side nav */}
      <aside className="lg:col-span-3">
        <div className="lg:sticky lg:top-24 bg-surface border border-outline-variant rounded-xl p-4">
          <h2 className="text-headline-md text-on-surface mb-2">Support Center</h2>
          <p className="text-body-sm text-on-surface-variant mb-4">
            AmaZara policies, terms, and how-to guides.
          </p>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-thin">
            {sections.map((s) => (
              <Link
                key={s.id}
                to={`/policy/${s.id}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-body-sm transition-colors shrink-0 ${
                  s.id === active.id
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
                }`}
              >
                <Icon name={s.icon} size={18} />
                <span>{s.title}</span>
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <article className="lg:col-span-9 space-y-12">
        <header className="border-b border-outline-variant pb-4">
          <span className="text-label-md text-primary uppercase tracking-wider">AmaZara</span>
          <h1 className="text-headline-lg text-on-surface mt-1 flex items-center gap-3">
            <Icon name={active.icon} className="text-primary" size={32} />
            {active.title}
          </h1>
        </header>

        {active.content.map((block) => (
          <section key={block.heading}>
            <h2 className="text-headline-md text-on-surface mb-3">{block.heading}</h2>
            <p className="text-body-md text-on-surface-variant leading-relaxed">{block.body}</p>
          </section>
        ))}

        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 flex items-start gap-4">
          <Icon name="info" className="text-primary mt-1" />
          <div className="text-body-sm text-on-surface-variant">
            Need more help? Open the AmaZara Assistant chat in the bottom-right corner, or{' '}
            <Link to="/messages" className="text-primary hover:underline">
              message our support team
            </Link>
            .
          </div>
        </div>
      </article>
    </div>
  );
}
