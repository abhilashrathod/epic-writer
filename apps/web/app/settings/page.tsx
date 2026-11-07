import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AiKeysSettings } from '../../components/AiKeysSettings';
import { currentUser } from '../../lib/session';

export default async function SettingsPage() {
  if (!(await currentUser())) redirect('/signin');
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← All projects
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <AiKeysSettings />
    </div>
  );
}
