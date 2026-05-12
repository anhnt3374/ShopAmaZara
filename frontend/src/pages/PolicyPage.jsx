import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

const sections = [
  {
    id: 'privacy',
    title: 'Quy định bảo mật',
    icon: 'shield_lock',
    content: [
      {
        heading: 'Thu thập dữ liệu cá nhân',
        body:
          'AmaZara chỉ thu thập các dữ liệu cần thiết để hoàn tất giao dịch và cải thiện trải nghiệm mua sắm. Mọi dữ liệu nhạy cảm như thẻ thanh toán được mã hóa và xử lý qua đối tác đạt chuẩn PCI-DSS.',
      },
      {
        heading: 'Quyền của người dùng',
        body:
          'Bạn có quyền truy cập, chỉnh sửa hoặc xóa dữ liệu cá nhân của mình bất cứ lúc nào trong phần Cài đặt → Quyền riêng tư. Yêu cầu xóa được xử lý trong vòng 7 ngày làm việc.',
      },
    ],
  },
  {
    id: 'terms',
    title: 'Điều khoản sử dụng',
    icon: 'gavel',
    content: [
      {
        heading: 'Tài khoản và bảo mật',
        body:
          'Người dùng có trách nhiệm bảo mật mật khẩu và toàn bộ hoạt động phát sinh từ tài khoản của mình. AmaZara có quyền tạm khóa tài khoản nếu phát hiện hành vi đáng ngờ.',
      },
      {
        heading: 'Hành vi bị cấm',
        body:
          'Nghiêm cấm sử dụng nền tảng để rao bán hàng giả, vi phạm bản quyền hoặc tổ chức gian lận. Vi phạm sẽ dẫn tới khóa tài khoản vĩnh viễn và có thể bị xử lý theo pháp luật.',
      },
    ],
  },
  {
    id: 'shipping',
    title: 'Hướng dẫn vận chuyển',
    icon: 'local_shipping',
    content: [
      {
        heading: 'Khu vực giao hàng',
        body:
          'AmaZara giao hàng tới 63 tỉnh thành tại Việt Nam và hơn 60 quốc gia. Thời gian giao nội địa từ 1-3 ngày làm việc, quốc tế từ 5-14 ngày tùy đối tác vận chuyển.',
      },
      {
        heading: 'Phí vận chuyển',
        body:
          'Đơn hàng nội địa trên 500.000đ được miễn phí giao hàng tiêu chuẩn. Phí giao nhanh và quốc tế hiển thị tại bước thanh toán dựa trên trọng lượng và điểm đến.',
      },
    ],
  },
  {
    id: 'vendor',
    title: 'Quy định người bán',
    icon: 'storefront',
    content: [
      {
        heading: 'Đăng ký gian hàng',
        body:
          'Người bán phải cung cấp giấy phép kinh doanh hợp lệ và tài liệu xác minh nguồn gốc sản phẩm. Hồ sơ được duyệt trong 3 ngày làm việc.',
      },
      {
        heading: 'Chính sách hoa hồng',
        body:
          'AmaZara thu phí dịch vụ 5-12% trên mỗi đơn hàng tùy ngành hàng, được hiển thị minh bạch trong dashboard và đối soát hàng tuần.',
      },
    ],
  },
  {
    id: 'support',
    title: 'Liên hệ hỗ trợ',
    icon: 'support_agent',
    content: [
      {
        heading: 'Kênh hỗ trợ',
        body:
          'Bạn có thể liên hệ AmaZara qua chat trực tiếp 24/7, email support@amazara.com hoặc hotline 1900 1234 trong giờ hành chính.',
      },
      {
        heading: 'Thời gian phản hồi',
        body:
          'Chúng tôi cam kết phản hồi mọi yêu cầu trong vòng 1 giờ qua chat và 24 giờ qua email. Khiếu nại được xử lý ưu tiên trong 72 giờ.',
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
          <h2 className="text-headline-md text-on-surface mb-2">Trung tâm hỗ trợ</h2>
          <p className="text-body-sm text-on-surface-variant mb-4">
            Các quy định, điều khoản và hướng dẫn của AmaZara.
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
            Bạn cần thêm trợ giúp? Mở chat AmaZara Assistant ở góc dưới bên phải, hoặc{' '}
            <Link to="/messages" className="text-primary hover:underline">
              gửi tin nhắn cho đội ngũ hỗ trợ
            </Link>
            .
          </div>
        </div>
      </article>
    </div>
  );
}
