export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return Response.json({
    url_set: !!url,
    url_prefix: url.slice(0, 15) || "(empty)",
    url_length: url.length,
    key_set: !!key,
    key_prefix: key.slice(0, 12) || "(empty)",
    key_length: key.length,
  });
}
