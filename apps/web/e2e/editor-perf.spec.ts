import { expect, test } from '@playwright/test';
import { generateScript } from '../../../packages/fountain/script-fixture';
import { createEpisode } from './helpers';

/**
 * Per-keystroke cost of a full CodeMirror update in a real browser: state, incremental line types,
 * viewport decorations and DOM sync all run synchronously inside dispatch.
 */
test('typing in a 60-page script stays under 16 ms per keystroke (ED-8)', async ({
  page,
  request,
}) => {
  await page.goto(await createEpisode(request, 'Perf World'));
  await expect(page.getByRole('textbox', { name: 'Script' })).toBeFocused();

  const results = await page.evaluate((script) => {
    type View = {
      state: { doc: { length: number; lines: number; line(n: number): { to: number } } };
      dispatch(spec: object): void;
    };
    const view = (window as unknown as { __epicEditor: View }).__epicEditor;
    view.dispatch({ changes: { from: 0, insert: script } });

    const measure = (pos: () => number) => {
      view.dispatch({ selection: { anchor: pos() }, scrollIntoView: true });
      const samples: number[] = [];
      for (let i = 0; i < 200; i++) {
        const at = pos();
        const t0 = performance.now();
        view.dispatch({ changes: { from: at, insert: 'a' }, selection: { anchor: at + 1 } });
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      return { median: samples[100]!, p99: samples[197]!, max: samples[199]! };
    };
    const end = measure(() => view.state.doc.length);
    const middle = measure(() => view.state.doc.line(Math.floor(view.state.doc.lines / 2)).to);
    return { lines: view.state.doc.lines, end, middle };
  }, generateScript());

  const fmt = (r: { median: number; p99: number; max: number }) =>
    `median ${r.median.toFixed(2)} ms, p99 ${r.p99.toFixed(2)} ms, max ${r.max.toFixed(2)} ms`;
  process.stdout.write(
    `[perf] ${results.lines} lines\n[perf] end:    ${fmt(results.end)}\n[perf] middle: ${fmt(results.middle)}\n`,
  );
  expect(results.lines).toBeGreaterThan(2900);
  expect(results.end.p99).toBeLessThan(16);
  expect(results.middle.p99).toBeLessThan(16);
});
