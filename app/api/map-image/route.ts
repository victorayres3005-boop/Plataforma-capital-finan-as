/**
 * GET /api/map-image?address=ENDERECO&type=map|streetview|places&...
 * Proxy server-side para Google Maps Static / Street View / Places API (New).
 *
 * type=map|streetview  → comportamento original (base64 + mime)
 * type=places          → Places API (fotos reais) + validação Gemini Vision
 *   params extras: razaoSocial, cnae, porte
 *   retorna: { fotos, place_id, nome_encontrado, fallback }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GEMINI_KEY = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")[0].trim();

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2000) return null;
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    return {
      base64: Buffer.from(buf).toString("base64"),
      mime: ct.startsWith("image/jpeg") ? "jpeg" : "png",
    };
  } catch {
    return null;
  }
}

async function validatePhotoWithGemini(
  base64: string,
  mime: string,
  ctx: { razaoSocial: string; cnae: string; porte: string; endereco: string },
): Promise<boolean> {
  if (!GEMINI_KEY) return true;
  try {
    const prompt =
      `Analise esta foto do Google Maps referente à empresa "${ctx.razaoSocial}", ` +
      `endereço "${ctx.endereco}", CNAE "${ctx.cnae}", porte "${ctx.porte}". ` +
      `É relevante para um relatório de análise de crédito (mostra fachada, instalações ou atividade comercial)? ` +
      `Retorne SOMENTE JSON: {"relevante":true} ou {"relevante":false}`;

    const body = {
      contents: [{ parts: [
        { inlineData: { mimeType: `image/${mime}`, data: base64 } },
        { text: prompt },
      ]}],
      generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 32 },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) return true;
    const json = await res.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"relevante":true}';
    return JSON.parse(text).relevante !== false;
  } catch {
    return true;
  }
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type        = searchParams.get("type") ?? "map";
  const address     = searchParams.get("address");
  const lat         = searchParams.get("lat");
  const lng         = searchParams.get("lng");
  const heading     = searchParams.get("heading");
  const razaoSocial = searchParams.get("razaoSocial") ?? "";
  const cnae        = searchParams.get("cnae") ?? "";
  const porte       = searchParams.get("porte") ?? "";

  const key = process.env.GOOGLE_MAPS_STATIC_KEY;
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 500 });

  // ── type=places ────────────────────────────────────────────────────────────
  if (type === "places") {
    if (!address) return NextResponse.json({ fotos: [], fallback: true, place_id: null, nome_encontrado: null });

    try {
      // 1) Busca place_id + lista de fotos
      const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.id,places.displayName,places.photos,places.formattedAddress",
        },
        body: JSON.stringify({
          textQuery: `${razaoSocial} ${address}`.trim(),
          languageCode: "pt-BR",
          maxResultCount: 3,
        }),
      });

      if (!searchRes.ok) {
        console.warn(`[map-image/places] searchText ${searchRes.status}`);
        return NextResponse.json({ fotos: [], fallback: true, place_id: null, nome_encontrado: null });
      }

      const searchJson = await searchRes.json() as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          photos?: Array<{ name: string }>;
        }>;
      };
      const places = searchJson.places ?? [];

      if (places.length === 0) {
        console.log(`[map-image/places] sem resultado: "${razaoSocial} ${address}"`);
        return NextResponse.json({ fotos: [], fallback: true, place_id: null, nome_encontrado: null });
      }

      const place        = places[0];
      const place_id     = place.id ?? null;
      const nome_encontrado = place.displayName?.text ?? null;
      const photos       = place.photos ?? [];

      console.log(`[map-image/places] "${nome_encontrado}" place_id=${place_id} fotos=${photos.length}`);

      if (photos.length === 0) {
        return NextResponse.json({ fotos: [], fallback: true, place_id, nome_encontrado });
      }

      // 2) Busca até 4 fotos em paralelo via media endpoint
      const photoResults = await Promise.all(
        photos.slice(0, 4).map(async (photo) => {
          try {
            const mediaRes = await fetch(
              `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=800&skipHttpRedirect=true&key=${key}`,
            );
            if (!mediaRes.ok) return null;
            const mediaJson = await mediaRes.json() as { photoUri?: string };
            if (!mediaJson.photoUri) return null;
            return await fetchImageAsBase64(mediaJson.photoUri);
          } catch {
            return null;
          }
        }),
      );

      const validPhotos = photoResults.filter((p): p is { base64: string; mime: string } => p !== null);

      if (validPhotos.length === 0) {
        return NextResponse.json({ fotos: [], fallback: true, place_id, nome_encontrado });
      }

      // 3) Validação Gemini Vision em paralelo
      const ctx = { razaoSocial, cnae, porte, endereco: address };
      const validations = await Promise.all(
        validPhotos.map(p => validatePhotoWithGemini(p.base64, p.mime, ctx)),
      );

      const fotos = validPhotos
        .filter((_, i) => validations[i])
        .map(p => ({ base64: p.base64, mime: p.mime, tipo: "places" }));

      console.log(`[map-image/places] ${fotos.length}/${validPhotos.length} fotos relevantes`);

      if (fotos.length === 0) {
        return NextResponse.json({ fotos: [], fallback: true, place_id, nome_encontrado });
      }

      return NextResponse.json({ fotos, fallback: false, place_id, nome_encontrado });
    } catch (err) {
      console.error("[map-image/places] erro:", err instanceof Error ? err.message : err);
      return NextResponse.json({ fotos: [], fallback: true, place_id: null, nome_encontrado: null });
    }
  }

  // ── type=map | streetview ──────────────────────────────────────────────────
  let location: string;
  if (address) {
    location = encodeURIComponent(address);
  } else if (lat && lng) {
    location = `${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
  } else {
    return NextResponse.json({ error: "missing_location" }, { status: 400 });
  }

  const h = heading != null ? Math.max(0, Math.min(359, parseInt(heading) || 0)) : 0;

  const url =
    type === "streetview"
      ? `https://maps.googleapis.com/maps/api/streetview?size=640x480&scale=2&location=${location}&fov=80&pitch=5&heading=${h}&key=${key}`
      : `https://maps.googleapis.com/maps/api/staticmap?center=${location}&zoom=16&size=640x480&scale=2&maptype=hybrid`
        + `&markers=color:red%7C${location}`
        + `&key=${key}`;

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return NextResponse.json({ error: `upstream_${res.status}` });
    const contentType = res.headers.get("content-type") ?? "image/png";
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2000) return NextResponse.json({ error: "no_imagery" });
    const base64 = Buffer.from(buf).toString("base64");
    const mime   = contentType.startsWith("image/jpeg") ? "jpeg" : "png";
    return NextResponse.json({ base64, mime });
  } catch {
    return NextResponse.json({ error: "unavailable" });
  }
}
