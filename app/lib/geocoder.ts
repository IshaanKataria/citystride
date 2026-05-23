import type { AddressRecord } from "./types";

interface Geocoder {
  readonly search: (query: string, limit?: number) => readonly AddressRecord[];
}

export const createGeocoder = (addresses: readonly AddressRecord[]): Geocoder => {
  const normalized = addresses.map((a) => ({
    record: a,
    lower: a.address.toLowerCase(),
  }));

  const search = (query: string, limit: number = 5): readonly AddressRecord[] => {
    const q = query.toLowerCase().trim();
    if (q.length === 0) {
      return [];
    }

    const scored: { record: AddressRecord; score: number }[] = [];

    for (const { record, lower } of normalized) {
      if (lower === q) {
        scored.push({ record, score: 3 });
      } else if (lower.startsWith(q)) {
        scored.push({ record, score: 2 });
      } else if (lower.includes(q)) {
        scored.push({ record, score: 1 });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.record);
  };

  return { search };
};
