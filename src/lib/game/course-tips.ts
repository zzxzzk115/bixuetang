import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { courseTips, users } from "../db/schema";

export interface CourseTipRow {
  id: number;
  userId: number;
  name: string;
  avatar: string | null;
  text: string;
  createdAt: number;
  isOwn: boolean;
}

/** 某门课的学习心得(最新在前) */
export function listCourseTips(
  courseId: string,
  viewerId: number,
): CourseTipRow[] {
  return db
    .select({
      id: courseTips.id,
      userId: courseTips.userId,
      displayName: users.displayName,
      username: users.username,
      avatar: users.avatar,
      text: courseTips.text,
      createdAt: courseTips.createdAt,
    })
    .from(courseTips)
    .innerJoin(users, eq(users.id, courseTips.userId))
    .where(eq(courseTips.courseId, courseId))
    .orderBy(desc(courseTips.createdAt))
    .limit(50)
    .all()
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.displayName || r.username,
      avatar: r.avatar,
      text: r.text,
      createdAt: r.createdAt,
      isOwn: r.userId === viewerId,
    }));
}
