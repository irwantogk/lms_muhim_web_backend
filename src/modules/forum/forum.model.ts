import { type Static } from "@sinclair/typebox";
import { t } from "elysia";
import { uuidPattern } from "../../common/validation.ts";

export const forumMetaSchema = t.Object({
  classes: t.Array(t.Object({ id: t.String(), name: t.String() })),
  subjects: t.Array(
    t.Object({ id: t.String(), code: t.String(), name: t.String() }),
  ),
});

export const successForumMetaSchema = t.Object({
  success: t.Literal(true),
  data: forumMetaSchema,
});

export const forumTopicItemSchema = t.Object({
  id: t.String(),
  className: t.String(),
  classId: t.String(),
  subjectCode: t.String(),
  subjectName: t.String(),
  authorName: t.String(),
  authorRole: t.Union([
    t.Literal("admin"),
    t.Literal("guru"),
    t.Literal("murid"),
    t.Literal("orang_tua"),
  ]),
  title: t.String(),
  body: t.String(),
  isHidden: t.Boolean(),
  replies: t.Integer(),
  createdAt: t.String(),
});

export const listForumTopicsQuerySchema = t.Object({
  classId: t.Optional(t.String({ pattern: uuidPattern })),
});

export const createForumTopicBodySchema = t.Object({
  classId: t.String({ pattern: uuidPattern }),
  subjectId: t.String({ pattern: uuidPattern }),
  title: t.String({ minLength: 1, maxLength: 200 }),
  body: t.String({ minLength: 1, maxLength: 4000 }),
});

export const successCreateForumTopicSchema = t.Object({
  success: t.Literal(true),
  data: forumTopicItemSchema,
});

export const successListForumTopicsSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({
    availableClasses: t.Array(t.Object({ id: t.String(), name: t.String() })),
    currentClassId: t.Union([t.String(), t.Null()]),
    topics: t.Array(forumTopicItemSchema),
  }),
});

export type ForumTopicItem = Static<typeof forumTopicItemSchema>;

export const forumReplyItemSchema = t.Object({
  id: t.String(),
  authorName: t.String(),
  authorRole: t.Union([
    t.Literal("admin"),
    t.Literal("guru"),
    t.Literal("murid"),
    t.Literal("orang_tua"),
  ]),
  body: t.String(),
  isHidden: t.Boolean(),
  createdAt: t.String(),
});

export const forumTopicDetailSchema = t.Object({
  topic: forumTopicItemSchema,
  replies: t.Array(forumReplyItemSchema),
});

export const successForumTopicDetailSchema = t.Object({
  success: t.Literal(true),
  data: forumTopicDetailSchema,
});

export const forumTopicIdParamsSchema = t.Object({
  id: t.String({ pattern: uuidPattern }),
});

export const createForumReplyBodySchema = t.Object({
  body: t.String({ minLength: 1, maxLength: 2000 }),
});

export const successCreateForumReplySchema = t.Object({
  success: t.Literal(true),
  data: forumReplyItemSchema,
});

export const moderationHiddenBodySchema = t.Object({
  hidden: t.Boolean(),
});

export const forumReplyIdParamsSchema = t.Object({
  id: t.String({ pattern: uuidPattern }),
});

export const successModerationMessageSchema = t.Object({
  success: t.Literal(true),
  data: t.Object({ message: t.String() }),
});
