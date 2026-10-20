export const RESERVED_SLUGS = [
  'admin','api','login','logout','register','signup','dashboard','settings','support','app','static',
  'assets','_next','public','portal','health','status','help','docs','terms','privacy','about',
  'contact','callback','callbacks','router','routers','www','mail','billing','account','auth','decan-konnect',
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

/** Returns an error message, or null when the slug is acceptable. */
export function validateSlug(slug: string): string | null {
  if (typeof slug !== 'string') return 'Slug is required.';
  if (slug !== slug.toLowerCase()) return 'Use lowercase letters only.';
  if (slug.length < 3 || slug.length > 50) return 'Slug must be 3-50 characters.';
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return 'Use only letters, numbers and hyphens (not at the start or end).';
  if (slug.includes('--')) return 'Avoid consecutive hyphens.';
  if (RESERVED_SLUGS.includes(slug)) return 'That name is reserved. Choose another.';
  return null;
}
