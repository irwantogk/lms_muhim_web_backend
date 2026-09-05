import type { Role } from "../../common/types.ts";
import { ForbiddenError, NotFoundError } from "../../utils/errors.ts";
import type { MaterialsStore } from "../materials/materials.repo.ts";
import type { ForumTopicItem } from "./forum.model.ts";
import type { ForumStore } from "./forum.repo.ts";

async function assertTeacherCan(
  scope: MaterialsStore,
  topic: { classId: string; subjectId: string },
  teacherId: string,
): Promise<void> {
  const teaches = await scope.teaches(topic.classId, topic.subjectId, teacherId);
  if (!teaches) {
    throw new ForbiddenError(
      "Anda hanya dapat memoderasi topik kelas/mapel yang diampu",
    );
  }
}

export interface ForumServiceDeps {
  repo: ForumStore;
  scope: MaterialsStore;
}

export interface ForumListOptions {
  role: Role;
  userId: string;
  classId?: string;
}

export interface ForumService {
  meta(options: { role: Role; userId: string }): Promise<{
    classes: Array<{ id: string; name: string }>;
    subjects: Array<{ id: string; code: string; name: string }>;
  }>;
  listTopics(options: ForumListOptions): Promise<{
    availableClasses: Array<{ id: string; name: string }>;
    currentClassId: string | null;
    topics: ForumTopicItem[];
  }>;
  detailTopic(options: { role: Role; userId: string; id: string }): Promise<{
    topic: ForumTopicItem;
    replies: Array<{
      id: string;
      authorName: string;
      authorRole: ForumTopicItem["authorRole"];
      body: string;
      isHidden: boolean;
      createdAt: string;
    }>;
  }>;
  createTopic(options: {
    role: Role;
    userId: string;
    classId: string;
    subjectId: string;
    title: string;
    body: string;
  }): Promise<ForumTopicItem>;
  replyTopic(options: {
    role: Role;
    userId: string;
    topicId: string;
    body: string;
  }): Promise<{
    id: string;
    authorName: string;
    authorRole: ForumTopicItem["authorRole"];
    body: string;
    isHidden: boolean;
    createdAt: string;
  }>;
  hideOrShowTopic(options: {
    teacherId: string;
    topicId: string;
    hidden: boolean;
  }): Promise<ForumTopicItem>;
  deleteTopicAction(options: {
    teacherId: string;
    topicId: string;
  }): Promise<void>;
  hideOrShowReply(options: {
    teacherId: string;
    replyId: string;
    hidden: boolean;
  }): Promise<{
    id: string;
    authorName: string;
    authorRole: ForumTopicItem["authorRole"];
    body: string;
    isHidden: boolean;
    createdAt: string;
  }>;
  deleteReplyAction(options: {
    teacherId: string;
    replyId: string;
  }): Promise<void>;
}

export function createForumService(deps: ForumServiceDeps): ForumService {
  const { repo, scope } = deps;

  async function classesForRole(role: Role, userId: string): Promise<Array<{ id: string; name: string }>> {
    switch (role) {
      case "murid": {
        const klass = await scope.studentClass(userId);
        return klass ? [klass] : [];
      }
      case "guru":
        return scope.teacherClasses(userId);
      case "orang_tua":
        return scope.parentClasses(userId);
      case "admin":
        return scope.allClasses();
    }
  }

  return {
    async meta(options) {
      const classes = await classesForRole(options.role, options.userId);
      const subjects = await repo.allSubjects();
      return { classes, subjects };
    },

    async listTopics(options) {
      const availableClasses = await classesForRole(options.role, options.userId);
      if (availableClasses.length === 0) {
        return { availableClasses: [], currentClassId: null, topics: [] };
      }
      const requested = availableClasses.some((c) => c.id === options.classId)
        ? options.classId
        : null;
      const classIds = requested ? [requested] : availableClasses.map((c) => c.id);

      const includeHidden = options.role === "guru";
      const rows = await repo.listTopics({ classIds, includeHidden });
      const counts = await repo.replyCounts(rows.map((row) => row.id));

      const topics: ForumTopicItem[] = rows.map((row) => ({
        id: row.id,
        className: row.className,
        classId: row.classId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        authorName: row.authorName,
        authorRole: row.authorRole,
        title: row.title,
        body: row.body,
        isHidden: row.isHidden,
        replies: counts.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
      }));

      return { availableClasses, currentClassId: requested ?? null, topics };
    },

    async detailTopic(options) {
      const availableClasses = await classesForRole(options.role, options.userId);
      const topic = await repo.topicById(options.id);
      if (!topic) throw new NotFoundError("Topik tidak ditemukan");
      if (!availableClasses.some((c) => c.id === topic.classId)) {
        throw new ForbiddenError("Anda tidak memiliki akses ke topik ini");
      }
      if (topic.isHidden && options.role !== "guru") {
        throw new NotFoundError("Topik tidak ditemukan");
      }

      const includeHidden = options.role === "guru";
      const replies = await repo.repliesByTopic(options.id, includeHidden);

      const toTopic = (row: typeof topic): ForumTopicItem => ({
        id: row.id,
        className: row.className,
        classId: row.classId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        authorName: row.authorName,
        authorRole: row.authorRole,
        title: row.title,
        body: row.body,
        isHidden: row.isHidden,
        replies: replies.length,
        createdAt: row.createdAt.toISOString(),
      });

      return {
        topic: toTopic(topic),
        replies: replies.map((reply) => ({
          id: reply.id,
          authorName: reply.authorName,
          authorRole: reply.authorRole,
          body: reply.body,
          isHidden: reply.isHidden,
          createdAt: reply.createdAt.toISOString(),
        })),
      };
    },

    async createTopic(options) {
      if (options.role === "murid") {
        const klass = await scope.studentClass(options.userId);
        if (!klass || klass.id !== options.classId) {
          throw new ForbiddenError("Topik hanya dapat dibuat di kelas Anda");
        }
      } else {
        const teaches = await scope.teaches(
          options.classId,
          options.subjectId,
          options.userId,
        );
        if (!teaches) {
          throw new ForbiddenError(
            "Anda hanya dapat membuat topik untuk kelas/mapel yang diampu",
          );
        }
      }

      const { id } = await repo.insertTopic({
        classId: options.classId,
        subjectId: options.subjectId,
        authorId: options.userId,
        title: options.title.trim(),
        body: options.body.trim(),
      });

      const row = await repo.topicById(id);
      if (!row) throw new NotFoundError("Gagal memuat topik yang baru dibuat");
      return {
        id: row.id,
        className: row.className,
        classId: row.classId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        authorName: row.authorName,
        authorRole: row.authorRole,
        title: row.title,
        body: row.body,
        isHidden: false,
        replies: 0,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async replyTopic(options) {
      const topic = await repo.topicById(options.topicId);
      if (!topic) throw new NotFoundError("Topik tidak ditemukan");
      if (topic.isHidden && options.role !== "guru") {
        throw new NotFoundError("Topik tidak ditemukan");
      }

      if (options.role === "murid") {
        const klass = await scope.studentClass(options.userId);
        if (!klass || klass.id !== topic.classId) {
          throw new ForbiddenError("Anda hanya dapat membalas di kelas Anda");
        }
      } else {
        const teaches = await scope.teaches(
          topic.classId,
          topic.subjectId,
          options.userId,
        );
        if (!teaches) {
          throw new ForbiddenError(
            "Anda hanya dapat membalas topik kelas/mapel yang diampu",
          );
        }
      }

      const { id } = await repo.insertReply({
        topicId: options.topicId,
        authorId: options.userId,
        body: options.body.trim(),
      });

      const replies = await repo.repliesByTopic(options.topicId, true);
      const reply = replies.find((row) => row.id === id);
      if (!reply) throw new NotFoundError("Gagal memuat balasan");
      return {
        id: reply.id,
        authorName: reply.authorName,
        authorRole: reply.authorRole,
        body: reply.body,
        isHidden: reply.isHidden,
        createdAt: reply.createdAt.toISOString(),
      };
    },

    async hideOrShowTopic(options) {
      const topic = await repo.topicById(options.topicId);
      if (!topic) throw new NotFoundError("Topik tidak ditemukan");
      await assertTeacherCan(scope, topic, options.teacherId);
      await repo.setTopicHidden(options.topicId, options.hidden);
      const row = await repo.topicById(options.topicId);
      if (!row) throw new NotFoundError("Topik tidak ditemukan");
      return {
        id: row.id,
        className: row.className,
        classId: row.classId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        authorName: row.authorName,
        authorRole: row.authorRole,
        title: row.title,
        body: row.body,
        isHidden: row.isHidden,
        replies: 0,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async deleteTopicAction(options) {
      const topic = await repo.topicById(options.topicId);
      if (!topic) throw new NotFoundError("Topik tidak ditemukan");
      await assertTeacherCan(scope, topic, options.teacherId);
      const removed = await repo.deleteTopic(options.topicId);
      if (!removed) throw new NotFoundError("Topik tidak ditemukan");
    },

    async hideOrShowReply(options) {
      const reply = await repo.replyById(options.replyId);
      if (!reply) throw new NotFoundError("Balasan tidak ditemukan");
      const topic = await repo.topicById(reply.topicId);
      if (!topic) throw new NotFoundError("Topik tidak ditemukan");
      await assertTeacherCan(scope, topic, options.teacherId);
      await repo.setReplyHidden(options.replyId, options.hidden);
      const replies = await repo.repliesByTopic(reply.topicId, true);
      const updated = replies.find((row) => row.id === options.replyId);
      if (!updated) throw new NotFoundError("Balasan tidak ditemukan");
      return {
        id: updated.id,
        authorName: updated.authorName,
        authorRole: updated.authorRole,
        body: updated.body,
        isHidden: updated.isHidden,
        createdAt: updated.createdAt.toISOString(),
      };
    },

    async deleteReplyAction(options) {
      const reply = await repo.replyById(options.replyId);
      if (!reply) throw new NotFoundError("Balasan tidak ditemukan");
      const topic = await repo.topicById(reply.topicId);
      if (!topic) throw new NotFoundError("Topik tidak ditemukan");
      await assertTeacherCan(scope, topic, options.teacherId);
      const removed = await repo.deleteReply(options.replyId);
      if (!removed) throw new NotFoundError("Balasan tidak ditemukan");
    },
  };
}
