/** A generated screenplay of `scenes * 21` lines (145 scenes ≈ 60 pages), for tests and benchmarks. Generic names only. */
export function generateScript(scenes = 145): string {
  const out: string[] = [];
  for (let i = 1; i <= scenes; i++) {
    out.push(`${i % 2 ? 'INT' : 'EXT'}. PLACE ${i} - ${i % 3 ? 'DAY' : 'NIGHT'}`, '');
    out.push('Wind moves through the hall. Lamps flicker against the stone.', '');
    for (let j = 0; j < 4; j++) {
      out.push(j % 2 ? 'SECOND SPEAKER' : 'FIRST SPEAKER');
      if (j === 1) out.push('(quietly)');
      out.push('A line of dialogue that runs long enough to wrap across the page.', '');
    }
    out.push('They turn away.', '', 'CUT TO:', '');
  }
  return out.join('\n');
}
