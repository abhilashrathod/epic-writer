import { redirect } from 'next/navigation';
import { ProjectList } from '../components/ProjectList';
import { UserMenu } from '../components/UserMenu';
import { currentUser } from '../lib/session';

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect('/signin');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">Epic Writer</span>
        <UserMenu name={user.name} skin={user.preferences.skin} theme={user.preferences.theme} />
      </header>
      <main>
        <ProjectList />
      </main>
    </div>
  );
}
