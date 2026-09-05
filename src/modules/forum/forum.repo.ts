import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/index.ts";
import {
  classes,
  forumReplies,
  forumTopics,
  subjects,
  users,
} from "../../db/schema.ts";

export type ForumRole = "admin" | "guru" | "murid" | "orang_tua";

export interface ForumTopicRow {
  id: string;
  className: string;
  classId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  authorName: string;
  authorRole: ForumRole;
  title: string;
  body: string;
  isHidden: boolean;
  createdAt: Date;
}

export interface ForumStore {
  listTopics(query: {
    classIds: string[];
    includeHidden: boolean;
  }): Promise<ForumTopicRow[]>;
  allSubjects(): Promise<Array<{ id: string; code: string; name: string }>>;
  topicById(id: string): Promise<ForumTopicRow | null>;
  insertTopic(input: {
    classId: string;
    subjectId: string;
    authorId: string;
    title: string;
    body: string;
  }): Promise<{ id: string }>;
  insertReply(input: {
    topicId: string;
    authorId: string;
    body: string;
  }): Promise<{ id: string }>;
  setTopicHidden(id: string, hidden: boolean): Promise<boolean>;
  deleteTopic(id: string): Promise<boolean>;
  replyById(id: string): Promise<{ id: string; topicId: string; isHidden: boolean } | null>;
  setReplyHidden(id: string, hidden: boolean): Promise<boolean>;
  deleteReply(id: string): Promise<boolean>;
  repliesByTopic(topicId: string, includeHidden: boolean): Promise<Array<{
    id: string;
    authorName: string;
    authorRole: ForumRole;
    body: string;
    isHidden: boolean;
    createdAt: Date;
  }>>;
  replyCounts(topicIds: string[]): Promise<Map<string, number>>;
}

export function createForumStore(db: Database): ForumStore {
  return {
    async allSubjects() {
      const rows = await db
        .select({ id: subjects.id, code: subjects.code, name: subjects.name })
        .from(subjects)
        .orderBy(subjects.name);
      return rows;
    },

    async listTopics(query) {
      if (query.classIds.length === 0) return [];

      const conditions = [inArray(forumTopics.classId, query.classIds)];
      if (!query.includeHidden) {
        conditions.push(eq(forumTopics.isHidden, false));
      }

      const rows = await db
        .select({
          id: forumTopics.id,
          className: classes.name,
          classId: forumTopics.classId,
          subjectId: forumTopics.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          authorName: users.fullName,
          authorRole: users.role,
          title: forumTopics.title,
          body: forumTopics.body,
          isHidden: forumTopics.isHidden,
          createdAt: forumTopics.createdAt,
        })
        .from(forumTopics)
        .innerJoin(classes, eq(forumTopics.classId, classes.id))
        .innerJoin(subjects, eq(forumTopics.subjectId, subjects.id))
        .innerJoin(users, eq(forumTopics.authorId, users.id))
        .where(and(...conditions))
        .orderBy(desc(forumTopics.createdAt));

      return rows.map((row) => ({
        id: row.id,
        className: row.className,
        classId: row.classId,
        subjectId: row.subjectId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        authorName: row.authorName,
        authorRole: row.authorRole as ForumRole,
        title: row.title,
        body: row.body,
        isHidden: row.isHidden,
        createdAt: new Date(row.createdAt),
      }));
    },

    async topicById(id) {
      const [row] = await db
        .select({
          id: forumTopics.id,
          className: classes.name,
          classId: forumTopics.classId,
          subjectId: forumTopics.subjectId,
          subjectCode: subjects.code,
          subjectName: subjects.name,
          authorName: users.fullName,
          authorRole: users.role,
          title: forumTopics.title,
          body: forumTopics.body,
          isHidden: forumTopics.isHidden,
          createdAt: forumTopics.createdAt,
        })
        .from(forumTopics)
        .innerJoin(classes, eq(forumTopics.classId, classes.id))
        .innerJoin(subjects, eq(forumTopics.subjectId, subjects.id))
        .innerJoin(users, eq(forumTopics.authorId, users.id))
        .where(eq(forumTopics.id, id))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        className: row.className,
        classId: row.classId,
        subjectId: row.subjectId,
        subjectCode: row.subjectCode,
        subjectName: row.subjectName,
        authorName: row.authorName,
        authorRole: row.authorRole as ForumRole,
        title: row.title,
        body: row.body,
        isHidden: row.isHidden,
        createdAt: new Date(row.createdAt),
      };
    },

    async insertTopic(input) {
      const [row] = await db
        .insert(forumTopics)
        .values({
          classId: input.classId,
          subjectId: input.subjectId,
          authorId: input.authorId,
          title: input.title,
          body: input.body,
        })
        .returning({ id: forumTopics.id });
      if (!row) throw new Error("Gagal menyimpan topik");
      return row;
    },

    async insertReply(input) {
      const [row] = await db
        .insert(forumReplies)
        .values({
          topicId: input.topicId,
          authorId: input.authorId,
          body: input.body,
        })
        .returning({ id: forumReplies.id });
      if (!row) throw new Error("Gagal menyimpan balasan");
      return row;
    },

    async setTopicHidden(id, hidden) {
      const result = await db
        .update(forumTopics)
        .set({ isHidden: hidden })
        .where(eq(forumTopics.id, id))
        .returning({ id: forumTopics.id });
      return result.length > 0;
    },

    async deleteTopic(id) {
      const result = await db
        .delete(forumTopics)
        .where(eq(forumTopics.id, id))
        .returning({ id: forumTopics.id });
      return result.length > 0;
    },

    async replyById(id) {
      const [row] = await db
        .select({
          id: forumReplies.id,
          topicId: forumReplies.topicId,
          isHidden: forumReplies.isHidden,
        })
        .from(forumReplies)
        .where(eq(forumReplies.id, id))
        .limit(1);
      return row ?? null;
    },

    async setReplyHidden(id, hidden) {
      const result = await db
        .update(forumReplies)
        .set({ isHidden: hidden })
        .where(eq(forumReplies.id, id))
        .returning({ id: forumReplies.id });
      return result.length > 0;
    },

    async deleteReply(id) {
      const result = await db
        .delete(forumReplies)
        .where(eq(forumReplies.id, id))
        .returning({ id: forumReplies.id });
      return result.length > 0;
    },

    async repliesByTopic(topicId, includeHidden) {
      const conditions = [eq(forumReplies.topicId, topicId)];
      if (!includeHidden) {
        conditions.push(eq(forumReplies.isHidden, false));
      }
      const rows = await db
        .select({
          id: forumReplies.id,
          authorName: users.fullName,
          authorRole: users.role,
          body: forumReplies.body,
          isHidden: forumReplies.isHidden,
          createdAt: forumReplies.createdAt,
        })
        .from(forumReplies)
        .innerJoin(users, eq(forumReplies.authorId, users.id))
        .where(and(...conditions))
        .orderBy(forumReplies.createdAt);
      return rows.map((row) => ({
        id: row.id,
        authorName: row.authorName,
        authorRole: row.authorRole as ForumRole,
        body: row.body,
        isHidden: row.isHidden,
        createdAt: new Date(row.createdAt),
      }));
    },

    async replyCounts(topicIds) {
      const result = new Map<string, number>();
      if (topicIds.length === 0) return result;
      const rows = await db
        .select({
          topicId: forumReplies.topicId,
          count: forumReplies.id,
        })
        .from(forumReplies)
        .where(inArray(forumReplies.topicId, topicIds));
      for (const row of rows) {
        const current = result.get(row.topicId) ?? 0;
        result.set(row.topicId, current + 1);
      }
      return result;
    },
  };
}
