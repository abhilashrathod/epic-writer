import { redirect } from 'next/navigation';
import { Button } from '@epic/ui';
import { signIn } from '../../auth';
import { currentUser } from '../../lib/session';

const ERRORS: Record<string, string> = {
  AccessDenied:
    'That GitHub account isn’t allowed. Sign in with the account this app is set up for.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await currentUser()) redirect('/');
  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? 'Sign-in failed. Try again.') : null;

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 rounded-2xl bg-surface p-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Epic Writer</h1>
        <form
          action={async () => {
            'use server';
            await signIn('github', { redirectTo: '/' });
          }}
        >
          <Button type="submit" variant="primary">
            Sign in with GitHub
          </Button>
        </form>
        {message && (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
