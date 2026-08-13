import { client } from "../client";

export type RecapSpan = { t: string; b?: boolean };

export type RecapPerson = { name: string; about: string };
export type RecapEpisode = { title: string; paragraphs: string[] };

/**
 * Section of the "Кратко" tab. `kind` decides how the section is drawn
 * (recap-document.tsx); an unfamiliar kind still shows every string found
 * inside the section, so an unknown future kind never loses content.
 */
export type RecapSection = {
  title: string;
  kind: string;
  people?: RecapPerson[];
  episodes?: RecapEpisode[];
  paragraphs?: string[];
  items?: string[];
};

export type RecapPart = { number: number; paragraphs: string[] };

export type RecapDocument = {
  version: number;
  bookId: number;
  book: { title: string; authors: string[]; series: string | null; seriesNumber: number | null };
  recap: { sections: RecapSection[] };
  retell: { parts: RecapPart[] };
};

export function fetchRecap(path: string, signal?: AbortSignal): Promise<RecapDocument> {
  return client<RecapDocument>("GET", path, { signal });
}
