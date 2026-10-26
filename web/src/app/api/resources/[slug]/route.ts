import { getResourceBySlug } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Lean JSON for the map's detail panel — one resource per request,
 * fetched on demand when a pin is selected (never the dataset).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);
  if (!resource) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({
    slug: resource.slug,
    name: resource.name,
    description: resource.description,
    website: resource.website,
    publicPhone: resource.public_phone,
    categories: resource.categories,
    lastVerifiedOn: resource.last_verified_on,
    locations: resource.locations.map((l) => ({
      address: l.address,
      city: l.city,
      state: l.state,
      postalCode: l.postal_code,
    })),
  });
}
