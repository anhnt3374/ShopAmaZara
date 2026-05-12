import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-margin-mobile md:px-margin-desktop py-8">
      <Outlet />
    </div>
  );
}
