'use client';

import type { EntityImageDto } from '@epic/schemas/api';
import { focusRing } from '@epic/ui';
import { ImageUploadButton } from './ImageUploadButton';

export const assetUrl = (projectId: string, assetId: string) =>
  `/api/projects/${projectId}/assets/${assetId}`;

export const primaryImage = (projectId: string, e: { images: EntityImageDto[] }) => {
  const img = e.images.find((i) => i.primary) ?? e.images[0];
  return img && assetUrl(projectId, img.assetId);
};

/** An entry's images (CX-5): upload, caption, choose the primary one, remove. */
export function EntryImages(props: {
  projectId: string;
  images: EntityImageDto[];
  onChange: (images: EntityImageDto[]) => void;
}) {
  const { projectId, images, onChange } = props;
  const edit = (i: number, p: Partial<EntityImageDto>) =>
    onChange(images.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">Images</legend>
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.assetId} className="flex flex-col gap-1 text-sm">
              <img
                src={assetUrl(projectId, img.assetId)}
                alt={img.caption || `Image ${i + 1}`}
                className="aspect-square w-full rounded-lg bg-sunk object-cover"
              />
              <input
                aria-label={`Image ${i + 1} caption`}
                placeholder="Caption"
                className={`h-8 rounded-md bg-sunk px-2 ${focusRing}`}
                value={img.caption}
                onChange={(e) => edit(i, { caption: e.target.value })}
              />
              <span className="flex items-center justify-between">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="primary-image"
                    checked={img.primary}
                    onChange={() => onChange(images.map((x, j) => ({ ...x, primary: j === i })))}
                  />
                  Primary
                </label>
                <button
                  type="button"
                  className={`rounded text-muted hover:text-ink ${focusRing}`}
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                >
                  Remove image {i + 1}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ImageUploadButton
        projectId={projectId}
        label="Upload images"
        multiple
        onUploaded={(up) =>
          onChange([
            ...images,
            ...up.map((u, n) => ({
              assetId: u.id,
              caption: '',
              primary: images.length === 0 && n === 0,
            })),
          ])
        }
      />
    </fieldset>
  );
}
