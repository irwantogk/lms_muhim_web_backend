import { describe, expect, it } from "bun:test";
import { ForbiddenError, ValidationError } from "../../../utils/errors.ts";
import type {
  ClassOption,
  InsertMaterialInput,
  MaterialsStore,
  MaterialRow,
} from "../materials.repo.ts";
import { createMaterialsService } from "../materials.service.ts";

const HEX = "a".repeat(32);

class FakeStore implements MaterialsStore {
  saved: InsertMaterialInput | null = null;

  async teaches(classId: string, subjectId: string, teacherId: string) {
    return teacherId === "g1" && classId === "c1" && subjectId === "mtk";
  }
  async studentClass(): Promise<ClassOption | null> {
    return { id: "c1", name: "XII IPA 1" };
  }
  async teacherClasses(): Promise<ClassOption[]> {
    return [{ id: "c1", name: "XII IPA 1" }];
  }
  async parentClasses(): Promise<ClassOption[]> {
    return [];
  }
  async allClasses(): Promise<ClassOption[]> {
    return [{ id: "c1", name: "XII IPA 1" }];
  }
  async materialById(id: string): Promise<MaterialRow | null> {
    if (!this.saved) return null;
    return {
      id,
      className: "XII IPA 1",
      classId: this.saved.classId,
      subjectCode: "MTK",
      subjectName: "Matematika",
      teacherName: "Budi Santoso",
      title: this.saved.title,
      description: this.saved.description,
      content: null,
      fileUrl: this.saved.fileUrl,
      type: this.saved.type,
      createdAt: new Date("2026-09-07T08:00:00Z"),
    };
  }
  async listFiltered(): Promise<MaterialRow[]> {
    return [];
  }
  async insertMaterial(input: InsertMaterialInput) {
    this.saved = input;
    return { id: "mat-1" };
  }
}

function service(store = new FakeStore()) {
  return createMaterialsService({
    repo: store,
    presign: async (ext, contentType) => ({
      key: `${HEX}.${ext}`,
      uploadUrl: `http://s3/upload?signature=x&ct=${encodeURIComponent(contentType ?? "")}`,
      fileUrl: `/uploads/${HEX}.${ext}`,
    }),
  });
}

describe("materials service (presigned upload)", () => {
  it("menerbitkan presigned URL untuk file valid", async () => {
    const result = await service().prepareUpload({
      teacherId: "g1",
      classId: "c1",
      subjectId: "mtk",
      fileName: "Modul Integral.pdf",
      fileSize: 1024,
    });

    expect(result.method).toBe("PUT");
    expect(result.key).toBe(`${HEX}.pdf`);
    expect(result.uploadUrl).toContain("signature=x");
    expect(result.type).toBe("pdf");
  });

  it("menolak ekstensi tidak didukung saat presign", async () => {
    await expect(
      service().prepareUpload({
        teacherId: "g1",
        classId: "c1",
        subjectId: "mtk",
        fileName: "foto.png",
        fileSize: 100,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("menolak mengunggah untuk kelas yang tidak diampu (pengampu)", async () => {
    await expect(
      service().prepareUpload({
        teacherId: "g1",
        classId: "c9",
        subjectId: "mtk",
        fileName: "a.pdf",
        fileSize: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("menolak confirm untuk kelas/mapel yang tidak diampu", async () => {
    await expect(
      service().confirmMaterial({
        teacherId: "g1",
        classId: "c9",
        subjectId: "mtk",
        key: `${HEX}.pdf`,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("confirm materi dengan kunci objek valid", async () => {
    const store = new FakeStore();
    const item = await service(store).confirmMaterial({
      teacherId: "g1",
      classId: "c1",
      subjectId: "mtk",
      key: `${HEX}.pdf`,
      title: "Modul Turunan",
    });

    expect(item.title).toBe("Modul Turunan");
    expect(item.fileUrl).toBe(`/uploads/${HEX}.pdf`);
    expect(item.type).toBe("pdf");
    expect(store.saved?.type).toBe("pdf");
  });

  it("menolak confirm kunci objek tak dikenal", async () => {
    await expect(
      service().confirmMaterial({
        teacherId: "g1",
        classId: "c1",
        subjectId: "mtk",
        key: "NOT-HEX.exe",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
