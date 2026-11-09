'use client';

import { describeNarrativeRef, narrativeItems, needsSceneLink } from '@epic/core/narrative-refs';
import { useNarrativeIndex } from '../../lib/use-narrative-index';

/** Read-only places in the story. An item with only a label asks for a scene link. */
export function NarrativeRefList(props: { value: unknown }) {
  const index = useNarrativeIndex();
  return (
    <ul className="flex flex-col gap-1">
      {narrativeItems(props.value).map((r, i) => (
        <li key={i}>
          {describeNarrativeRef(r, index)}
          {needsSceneLink(r) && (
            <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs">
              Needs a scene link
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
