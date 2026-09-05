import { MAX_FILE_MB, MAX_VIDEO_MB } from "../common/env.ts";

export type StoredKind = "pdf" | "video" | "dokumen";

const EXT_KIND: Record<string, StoredKind> = {
  pdf: "pdf",
  mp4: "video",
  webm: "video",
  mov: "video",
  m4v: "video",
  doc: "dokumen",
  docx: "dokumen",
  ppt: "dokumen",
  pptx: "dokumen",
  xls: "dokumen",
  xlsx: "dokumen",
  odt: "dokumen",
  txt: "dokumen",
};

export const STORAGE_KIND_LABEL: Record<StoredKind, string> = {
  pdf: "PDF",
  video: "video",
  dokumen: "dokumen",
};

export function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function kindOf(filename: string): StoredKind | null {
  return EXT_KIND[extensionOf(filename)] ?? null;
}

export function maxBytesFor(kind: StoredKind): number {
  const mb = kind === "video" ? MAX_VIDEO_MB : MAX_FILE_MB;
  return mb * 1024 * 1024;
}

export interface FileValidation {
  ok: boolean;
  error?: string;
  kind?: StoredKind;
}

export function validateFile(name: string, size: number): FileValidation {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Nama berkas tidak tersedia" };
  }
  const kind = kindOf(trimmed);
  if (!kind) {
    return {
      ok: false,
      error:
        "Jenis berkas tidak didukung. Gunakan PDF, video (mp4/webm/mov/m4v), atau dokumen (doc/docx/ppt/pptx/xls/xlsx/odt/txt).",
    };
  }
  const max = maxBytesFor(kind);
  if (size > max) {
    const mbLabel = kind === "video" ? MAX_VIDEO_MB : MAX_FILE_MB;
    return {
      ok: false,
      error: `Berkas terlalu besar. Maksimum ${mbLabel} MB untuk ${STORAGE_KIND_LABEL[kind]}.`,
    };
  }
  return { ok: true, kind };
}
