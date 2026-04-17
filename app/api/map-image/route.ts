/**
 * GET /api/map-image?address=ENDERECO&type=map|streetview&heading=0
 * Proxy server-side para Google Maps Static/Street View.
 * Aceita também lat= e lng= como alternativa.
 * Para streetview, parâmetro opcional heading (0-360°, default 0).
 * Retorna { base64: string, mime: string } ou { error: string }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type    = searchParams.get("type") ?? "map";
  const address = searchParams.get("address");
  const lat     = searchParams.get("lat");
  const lng     = searchParams.get("lng");
  const heading = searchParams.get("heading"); // 0-360°, opcional (só streetview)

  const key = process.env.GOOGLE_MAPS_STATIC_KEY;
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 500 });

  // Resolve location: address string takes priority over lat/lng
  let location: string;
  if (address) {
    location = encodeURIComponent(address);
  } else if (lat && lng) {
    location = `${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
  } else {
    return NextResponse.json({ error: "missing_location" }, { status: 400 });
  }

  // Heading seguro: clamp em 0-359 e default 0
  const h = heading != null ? Math.max(0, Math.min(359, parseInt(heading) || 0)) : 0;

  const url =
    type === "streetview"
      ? `https://maps.googleapis.com/maps/api/streetview?size=640x480&scale=2&location=${location}&fov=80&pitch=5&heading=${h}&key=${key}`
      : `https://maps.googleapis.com/maps/api/staticmap?center=${location}&zoom=16&size=640x480&scale=2&maptype=hybrid`
        + `&markers=color:red%7C${location}`
        + `&key=${key}`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
    if (!res.ok) return NextResponse.json({ error: `upstream_${res.status}` });

    const contentType = res.headers.get("content-type") ?? "image/png";
    // Street View returns a tiny gray JPEG when no imagery is available — detect by size
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2000) return NextResponse.json({ error: "no_imagery" });

    const base64 = Buffer.from(buf).toString("base64");
    const mime   = contentType.startsWith("image/jpeg") ? "jpeg" : "png";
    return NextResponse.json({ base64, mime });
  } catch {
    return NextResponse.json({ error: "unavailable" });
  }
}
