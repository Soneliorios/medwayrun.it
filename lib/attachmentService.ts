import { createRawClient } from "@/lib/supabase/client";
import { ORG_ID } from "@/lib/utils";

export interface Attachment {
  id: string;
  name: string;
  size: number;
  addedAt: string;
  mimeType?: string;
  /** Public Storage URL — used for inline preview (img/iframe/video). */
  dataUrl?: string;
  /** URL that forces a download with the original filename (cross-origin safe). */
  downloadUrl?: string;
}

const BUCKET = "task-files";

/** Append the Storage `?download=<name>` param so cross-origin downloads keep the filename. */
function withDownload(url: string, name: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}download=${encodeURIComponent(name)}`;
}

/** Derive the Storage object path from a public URL (for deletion). */
function pathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const raw = url.slice(i + marker.length).split("?")[0];
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function mapRow(r: any): Attachment {
  return {
    id: r.id,
    name: r.name,
    size: r.size ?? 0,
    addedAt: r.created_at,
    mimeType: r.mime ?? undefined,
    dataUrl: r.url,
    downloadUrl: r.url ? withDownload(r.url, r.name) : undefined,
  };
}

/**
 * Task attachments backed by Supabase Storage (bucket `task-files`) + the
 * `task_attachments` table (see supabase_task_files.sql). Replaces the old
 * localStorage data-URL storage.
 */
export const attachmentService = {
  async list(taskId: string): Promise<Attachment[]> {
    const sb = createRawClient();
    const { data, error } = await (sb as any)
      .from("task_attachments")
      .select("id, name, url, mime, size, created_at")
      .eq("task_id", taskId)
      .order("created_at");
    if (error) {
      console.error("[attachmentService.list]", error);
      return [];
    }
    return ((data ?? []) as any[]).map(mapRow);
  },

  async upload(taskId: string, file: File): Promise<Attachment | null> {
    const sb = createRawClient();
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${taskId}/${crypto.randomUUID()}_${safe}`;
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) {
      console.error("[attachmentService.upload]", upErr);
      return null;
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    const { data, error } = await (sb as any)
      .from("task_attachments")
      .insert({
        task_id: taskId,
        org_id: ORG_ID,
        name: file.name,
        url: pub.publicUrl,
        mime: file.type || null,
        size: file.size,
      })
      .select("id, name, url, mime, size, created_at")
      .single();
    if (error) {
      // Roll back the orphaned Storage object so it doesn't leak.
      await sb.storage.from(BUCKET).remove([path]).catch(() => {});
      console.error("[attachmentService.upload:insert]", error);
      return null;
    }
    return mapRow(data);
  },

  /** Upload from a base64 data URL — used to migrate old localStorage attachments. */
  async uploadDataUrl(
    taskId: string,
    name: string,
    mime: string | undefined,
    dataUrl: string
  ): Promise<Attachment | null> {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], name, { type: mime || blob.type });
      return await this.upload(taskId, file);
    } catch (e) {
      console.error("[attachmentService.uploadDataUrl]", e);
      return null;
    }
  },

  async remove(id: string): Promise<void> {
    const sb = createRawClient();
    // Delete the underlying Storage object too, so files don't orphan.
    const { data: row } = await (sb as any)
      .from("task_attachments")
      .select("url")
      .eq("id", id)
      .single();
    const path = row?.url ? pathFromUrl(row.url) : null;
    if (path) await sb.storage.from(BUCKET).remove([path]).catch(() => {});
    const { error } = await (sb as any).from("task_attachments").delete().eq("id", id);
    if (error) console.error("[attachmentService.remove]", error);
  },
};
