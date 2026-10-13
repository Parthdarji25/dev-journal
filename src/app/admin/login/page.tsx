import type { Metadata } from 'next';
import { LoginPage } from '@/components/admin/login-page';
import { siteName } from '@/lib/site';

export const metadata: Metadata = { title: 'Sign in' };

export default function AdminLoginPage() {
  return <LoginPage siteName={siteName} />;
}
