import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { analyzeCsv } from "@/lib/hyperlocal/crm/csv";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BUCKET = "hyperlocal-uploads";
const MAX_SIZE = 25 * 1024 * 1024;  // 25 MB

/**
 * POST /api/apps/hyperlocal/crm-connections/csv-upload
 * multipart/form-data: { file: File }
 * Uploads to hyperlocal-uploads/{user_id}/csv/{timestamp}.csv and returns
 * detected columns + sample rows so the user can confirm the mapping before
 * we create the connection. The returned storage_path lands on
 * filter_config.column_mapping.storage_path when the agent POSTs the create.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return Response.json(
      { error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const text = buffer.toString("utf-8");
  const analysis = analyzeCsv(text);

  // Persist to storage so the connector can re-read it at run time
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storagePath = `${user.id}/csv/${timestamp}-${safeName}`;

  const service = createServiceRoleClient();
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "text/csv",
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  return Response.json({
    storage_path: storagePath,
    filename: file.name,
    file_size_bytes: file.size,
    columns: analysis.columns,
    sample_rows: analysis.sample_rows,
    row_count: analysis.row_count,
  });
}
