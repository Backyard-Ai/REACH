import type { Resource } from "./db";

export type MapPoint = {
  slug: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
};

/** Extract map pins from published_resources rows (server-side). */
export function toMapPoints(resources: Resource[]): MapPoint[] {
  return resources.flatMap((r) =>
    r.locations
      .filter((l) => l.lat !== null && l.lng !== null)
      .map((l) => ({
        slug: r.slug,
        name: r.name,
        city: l.city,
        lat: l.lat as number,
        lng: l.lng as number,
      })),
  );
}
