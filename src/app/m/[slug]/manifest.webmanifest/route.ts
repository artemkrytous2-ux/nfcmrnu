import { loadVenuePwa, venueManifest } from "@/lib/venue-pwa";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const venue = await loadVenuePwa(slug);
  if (!venue) return new Response(null, { status: 404 });

  return Response.json(venueManifest(venue), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
