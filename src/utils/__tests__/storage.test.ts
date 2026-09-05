import { describe, expect, it } from "bun:test";
import {
  kindOf,
  maxBytesFor,
  validateFile,
} from "../storage.ts";

describe("storage file validation", () => {
  it("mengenali tipe dari ekstensi", () => {
    expect(kindOf("modul.pdf")).toBe("pdf");
    expect(kindOf("video.mp4")).toBe("video");
    expect(kindOf("slide.PPTX")).toBe("dokumen");
    expect(kindOf("catatan.txt")).toBe("dokumen");
    expect(kindOf("image.png")).toBeNull();
    expect(kindOf("file.exe")).toBeNull();
  });

  it("menerima file yang valid", () => {
    const result = validateFile("modul turunan.pdf", 5 * 1024 * 1024);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("pdf");
  });

  it("menolak tipe tidak didukung", () => {
    const result = validateFile("foto.png", 100);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("tidak didukung");
  });

  it("menolak nama kosong", () => {
    expect(validateFile("", 10).ok).toBe(false);
  });

  it("menolak video melebihi batas (200 MB)", () => {
    const max = maxBytesFor("video");
    const result = validateFile("video.mp4", max + 1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("terlalu besar");
  });

  it("menolak dokumen melebihi batas (20 MB)", () => {
    const max = maxBytesFor("dokumen");
    expect(validateFile("laporan.docx", max + 1).ok).toBe(false);
    expect(validateFile("laporan.docx", max).ok).toBe(true);
  });
});
