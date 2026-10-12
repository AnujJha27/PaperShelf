type AuthorYearReference = { reference_key: string; year: number | null; raw_text: string };
export type SourceBBox = { x: number; y: number; width: number; height: number; page_width: number; page_height: number };

export function blockSourceBBox(block: { bbox: SourceBBox | null }, asset?: { bbox: SourceBBox | null } | null): SourceBBox | null {
  return block.bbox ?? asset?.bbox ?? null;
}

export function referenceForAuthorYear<T extends AuthorYearReference>(citation: string, references: T[]): T | null {
  const match = citation.match(/^\(\s*([\p{L}][\p{L}'’-]*)(?:\s+et\s+al\.?)?,\s*((?:19|20)\d{2})\s*\)$/iu);
  if (!match) return null;
  const [, surname, yearText] = match;
  const escaped = surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const author = new RegExp(`(?:^|[^\\p{L}])${escaped}(?=[,.:\\s])`, "iu");
  const matches = references.filter((reference) => {
    const year = reference.year ?? Number(reference.raw_text.match(/\b(?:19|20)\d{2}\b/)?.[0]);
    if (year !== Number(yearText)) return false;
    const authorLine = reference.raw_text.replace(/^\s*(?:\[\d{1,4}\]|\d{1,4}[.)])\s*/, "").slice(0, 140);
    return author.test(authorLine);
  });
  return matches.length === 1 ? matches[0] : null;
}

export function referenceSourceUrl(reference: { doi: string | null; arxiv_id: string | null }): string | null {
  if (reference.doi && /^10\.\d{4,9}\/[._;()/:A-Z0-9-]+$/i.test(reference.doi)) return `https://doi.org/${reference.doi}`;
  if (reference.arxiv_id && /^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(reference.arxiv_id)) return `https://arxiv.org/abs/${reference.arxiv_id}`;
  return null;
}
