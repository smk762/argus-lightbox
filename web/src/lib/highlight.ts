// Split text into plain/matched segments for <mark> highlighting of the active
// search tokens and facet terms. Case-insensitive; longer terms win so
// "red dress" is marked whole rather than as "red" + "dress".

export interface Segment {
  text: string;
  match: boolean;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function highlightSegments(text: string, terms: string[]): Segment[] {
  const clean = [...new Set(terms.map((t) => t.trim().replace(/_/g, " ")).filter((t) => t.length > 1))];
  if (!text || clean.length === 0) return [{ text, match: false }];
  clean.sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${clean.map(escape).join("|")})`, "gi");
  return text
    .split(re)
    .filter(Boolean)
    .map((part) => ({ text: part, match: clean.some((t) => t.toLowerCase() === part.toLowerCase()) }));
}
