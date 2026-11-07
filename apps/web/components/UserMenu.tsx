'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { useState } from 'react';
import type { Skin, Theme } from '@epic/db';
import { Button } from '@epic/ui';
import { signOutAction } from '../app/actions';
import { api } from '../lib/api-client';

const item =
  'flex cursor-default items-center justify-between gap-6 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-sunk data-[state=checked]:font-medium';

export function UserMenu(props: { name: string; skin: Skin; theme: Theme }) {
  const [skin, setSkin] = useState(props.skin);
  const [theme, setTheme] = useState(props.theme);

  // Apply instantly; persisting is fire-and-forget so the switch never waits on the network.
  function save(next: { skin?: Skin; theme?: Theme }) {
    if (next.skin) {
      setSkin(next.skin);
      document.documentElement.dataset.skin = next.skin;
    }
    if (next.theme) {
      setTheme(next.theme);
      document.documentElement.dataset.theme = next.theme;
    }
    void api('/api/me/preferences', { method: 'PATCH', body: next }).catch(() => undefined);
  }

  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button aria-label="User menu">{props.name}</Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="min-w-48 rounded-xl bg-panel p-1.5 text-ink shadow-lg"
        >
          <Menu.Label className="px-2 py-1 text-xs text-faint">Skin</Menu.Label>
          <Menu.RadioGroup value={skin} onValueChange={(v) => save({ skin: v as Skin })}>
            <Menu.RadioItem value="ink" className={item}>
              Inkwell <Menu.ItemIndicator>✓</Menu.ItemIndicator>
            </Menu.RadioItem>
            <Menu.RadioItem value="sand" className={item}>
              Sand <Menu.ItemIndicator>✓</Menu.ItemIndicator>
            </Menu.RadioItem>
          </Menu.RadioGroup>
          <Menu.Label className="mt-1 px-2 py-1 text-xs text-faint">Theme</Menu.Label>
          <Menu.RadioGroup value={theme} onValueChange={(v) => save({ theme: v as Theme })}>
            {(['light', 'dark', 'system'] as const).map((t) => (
              <Menu.RadioItem key={t} value={t} className={item}>
                {t[0]?.toUpperCase() + t.slice(1)} <Menu.ItemIndicator>✓</Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.Item asChild className={`${item} mt-1`}>
            <Link href="/settings">Settings and AI keys</Link>
          </Menu.Item>
          <Menu.Item className={`${item} text-muted`} onSelect={() => void signOutAction()}>
            Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
