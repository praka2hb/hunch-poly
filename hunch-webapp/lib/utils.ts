import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize Twitter profile picture URL by removing "_normal" for higher resolution images
 * Example: https://pbs.twimg.com/profile_images/.../Q9oTfF37_normal.jpg -> https://pbs.twimg.com/profile_images/.../Q9oTfF37.jpg
 */
export function normalizeTwitterAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace('_normal', '');
}
