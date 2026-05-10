import { db } from '../db/index.server';
import { tags, taggables } from '$sailor/generated/schema';
import { eq, and, like, desc, sql, inArray, count } from 'drizzle-orm';
import { slugify } from '../utils/common';

export interface Tag {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTagData {
  name: string;
}

export interface TagWithCount extends Tag {
  usage_count: number;
}

export interface TagUsage {
  entity_type: string;
  usage_count: number;
}

export interface TagWithUsage extends Tag {
  usage: TagUsage[];
}

export class TagService {
  /**
   * Create a new tag
   */
  static async createTag(data: CreateTagData): Promise<Tag> {
    const slug = slugify(data.name);

    const [tag] = await db
      .insert(tags)
      .values({
        name: data.name,
        slug
      })
      .returning();

    return tag;
  }

  /**
   * Find or create a tag by name
   */
  static async findOrCreateTag(name: string): Promise<Tag> {
    // Try to find existing tag
    const existingTag = await db.query.tags.findFirst({
      where: eq(tags.name, name)
    });

    if (existingTag) {
      return existingTag;
    }

    // Create new tag if not found
    return this.createTag({ name });
  }

  /**
   * Get all tags with usage counts
   */
  static async getAllTags(): Promise<TagWithCount[]> {
    const result = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        created_at: tags.created_at,
        updated_at: tags.updated_at,
        usage_count: sql<number>`count(${taggables.id})`.as('usage_count')
      })
      .from(tags)
      .leftJoin(taggables, eq(tags.id, taggables.tag_id))
      .groupBy(tags.id)
      .orderBy(desc(sql`count(${taggables.id})`), tags.name);

    return result;
  }

  /**
   * Get all tags with detailed usage information by entity type
   */
  static async getAllTagsWithUsage(): Promise<TagWithUsage[]> {
    // First get all tags
    const allTags = await db.query.tags.findMany({
      orderBy: [tags.name]
    });

    // Get usage information grouped by entity type for each tag
    const tagsWithUsage: TagWithUsage[] = [];

    for (const tag of allTags) {
      const usageResult = await db
        .select({
          entity_type: taggables.taggable_type,
          usage_count: sql<number>`count(*)`.as('usage_count')
        })
        .from(taggables)
        .where(eq(taggables.tag_id, tag.id))
        .groupBy(taggables.taggable_type);

      tagsWithUsage.push({
        ...tag,
        usage: usageResult
      });
    }

    return tagsWithUsage;
  }

  /**
   * Aggregate tag counts across the whole table — site-wide `total`, `inUse`
   * (tags with at least one taggable row), and `unused`. Used by the admin
   * tag manager so the stat cards stay accurate independent of pagination.
   */
  static async getTagStats(): Promise<{ total: number; inUse: number; unused: number }> {
    const [totalRow, inUseRow] = await Promise.all([
      db.select({ total: count() }).from(tags),
      db
        .select({ total: sql<number>`count(distinct ${taggables.tag_id})`.as('total') })
        .from(taggables)
    ]);
    const total = Number(totalRow[0]?.total || 0);
    const inUse = Number(inUseRow[0]?.total || 0);
    return { total, inUse, unused: Math.max(0, total - inUse) };
  }

  /**
   * Paginated variant of {@link getAllTagsWithUsage}. Same N+1 usage-lookup
   * pattern, but bounded — for the admin tag manager where the full set can
   * grow large on content-heavy sites. `searchQuery` does a case-insensitive
   * `LIKE` against the tag name.
   */
  static async getAllTagsWithUsagePaginated(
    page: number,
    pageSize: number,
    searchQuery?: string
  ): Promise<{ tags: TagWithUsage[]; totalItems: number }> {
    const where = searchQuery?.trim() ? like(tags.name, `%${searchQuery.trim()}%`) : undefined;

    const [countResult, pagedTags] = await Promise.all([
      db.select({ total: count() }).from(tags).where(where),
      db.query.tags.findMany({
        where,
        orderBy: [tags.name],
        limit: pageSize,
        offset: (page - 1) * pageSize
      })
    ]);

    const tagsWithUsage: TagWithUsage[] = [];

    for (const tag of pagedTags) {
      const usageResult = await db
        .select({
          entity_type: taggables.taggable_type,
          usage_count: sql<number>`count(*)`.as('usage_count')
        })
        .from(taggables)
        .where(eq(taggables.tag_id, tag.id))
        .groupBy(taggables.taggable_type);

      tagsWithUsage.push({ ...tag, usage: usageResult });
    }

    return { tags: tagsWithUsage, totalItems: Number(countResult[0]?.total || 0) };
  }

  /**
   * Search tags by name, optionally scoped to a specific content type
   */
  static async searchTags(query: string, limit: number = 10, scope?: string): Promise<Tag[]> {
    if (!scope) {
      // Global search - return all matching tags
      return db.query.tags.findMany({
        where: like(tags.name, `%${query}%`),
        limit,
        orderBy: [tags.name]
      });
    }

    // Scoped search - return tags that have been used on this content type
    // or are used across multiple content types (global tags)
    const result = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        created_at: tags.created_at,
        updated_at: tags.updated_at
      })
      .from(tags)
      .innerJoin(taggables, eq(tags.id, taggables.tag_id))
      .where(and(like(tags.name, `%${query}%`), eq(taggables.taggable_type, scope)))
      .groupBy(tags.id)
      .orderBy(tags.name)
      .limit(limit);

    // If we found scoped results, return them
    if (result.length > 0) {
      return result;
    }

    // If no scoped results but query is short, also check for exact matches
    // to allow creation of new tags
    if (query.length >= 1) {
      return db.query.tags.findMany({
        where: like(tags.name, `%${query}%`),
        limit: Math.min(3, limit), // Fewer global suggestions
        orderBy: [tags.name]
      });
    }

    return [];
  }

  /**
   * Get tags for a specific taggable entity
   */
  static async getTagsForEntity(taggableType: string, taggableId: string): Promise<Tag[]> {
    const result = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        created_at: tags.created_at,
        updated_at: tags.updated_at
      })
      .from(tags)
      .innerJoin(taggables, eq(tags.id, taggables.tag_id))
      .where(and(eq(taggables.taggable_type, taggableType), eq(taggables.taggable_id, taggableId)))
      .orderBy(tags.name);

    return result;
  }

  /**
   * Tag an entity with multiple tags
   */
  static async tagEntity(
    taggableType: string,
    taggableId: string,
    tagNames: string[]
  ): Promise<void> {
    // Always remove existing tags for this entity first
    await db
      .delete(taggables)
      .where(and(eq(taggables.taggable_type, taggableType), eq(taggables.taggable_id, taggableId)));

    // If no new tags, we're done (existing tags have been cleared)
    if (tagNames.length === 0) return;

    // Find or create all tags
    const tagPromises = tagNames.map((name) => this.findOrCreateTag(name));
    const tagEntities = await Promise.all(tagPromises);

    // Add new tag relationships
    if (tagEntities.length > 0) {
      await db.insert(taggables).values(
        tagEntities.map((tag) => ({
          tag_id: tag.id,
          taggable_type: taggableType,
          taggable_id: taggableId
        }))
      );
    }
  }

  /**
   * Remove specific tags from an entity
   */
  static async untagEntity(
    taggableType: string,
    taggableId: string,
    tagIds: string[]
  ): Promise<void> {
    if (tagIds.length === 0) return;

    await db
      .delete(taggables)
      .where(
        and(
          eq(taggables.taggable_type, taggableType),
          eq(taggables.taggable_id, taggableId),
          inArray(taggables.tag_id, tagIds)
        )
      );
  }

  /**
   * Remove all tags from an entity
   */
  static async clearEntityTags(taggableType: string, taggableId: string): Promise<void> {
    await db
      .delete(taggables)
      .where(and(eq(taggables.taggable_type, taggableType), eq(taggables.taggable_id, taggableId)));
  }

  /**
   * Find entities by tags
   */
  static async findEntitiesByTags(
    taggableType: string,
    tagNames: string[],
    matchAll: boolean = false
  ): Promise<string[]> {
    if (tagNames.length === 0) return [];

    const tagEntities = await db.query.tags.findMany({
      where: inArray(tags.name, tagNames)
    });

    const tagIds = tagEntities.map((t: Tag) => t.id);
    if (tagIds.length === 0) return [];

    if (matchAll) {
      // Find entities that have ALL the specified tags
      const result = await db
        .select({
          taggable_id: taggables.taggable_id,
          tag_count: sql<number>`count(distinct ${taggables.tag_id})`.as('tag_count')
        })
        .from(taggables)
        .where(and(eq(taggables.taggable_type, taggableType), inArray(taggables.tag_id, tagIds)))
        .groupBy(taggables.taggable_id)
        .having(sql`count(distinct ${taggables.tag_id}) = ${tagIds.length}`);

      return result.map((r: any) => r.taggable_id);
    } else {
      // Find entities that have ANY of the specified tags
      const result = await db
        .selectDistinct({ taggable_id: taggables.taggable_id })
        .from(taggables)
        .where(and(eq(taggables.taggable_type, taggableType), inArray(taggables.tag_id, tagIds)));

      return result.map((r: any) => r.taggable_id);
    }
  }

  /**
   * Update a tag
   */
  static async updateTag(id: string, data: Partial<CreateTagData>): Promise<Tag> {
    const updateData: any = { ...data };

    if (data.name) {
      updateData.slug = data.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .trim();
    }

    const [tag] = await db.update(tags).set(updateData).where(eq(tags.id, id)).returning();

    return tag;
  }

  /**
   * Soft-delete a tag. Pivot rows in `taggables` are intentionally left intact
   * so that a restore returns the tag to its previously-tagged entities. Hard
   * removal happens via the recovery purge flow.
   */
  static async deleteTag(id: string, deletedBy?: string | null): Promise<void> {
    await db
      .update(tags)
      .set({ deleted_at: new Date(), deleted_by: deletedBy ?? null, updated_at: new Date() })
      .where(eq(tags.id, id));
  }
}
