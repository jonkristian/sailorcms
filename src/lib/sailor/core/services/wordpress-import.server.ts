import { db } from '$sailor/core/db/index.server';
import { sql, eq } from 'drizzle-orm';
import { uploadFile } from '../../utils/files/server';
import { TagService } from './tag.server';
import * as schema from '../../generated/schema';
import { taggables } from '../../generated/schema';
import crypto from 'crypto';
import { getCurrentTimestamp } from '../utils/date';
import { generateSlug } from '../utils/common';

// WordPress REST API Response Interfaces
export interface WordPressAPIPost {
  id: number;
  date: string;
  date_gmt: string;
  guid: { rendered: string };
  modified: string;
  modified_gmt: string;
  slug: string;
  status: 'publish' | 'draft' | 'private' | 'future';
  type: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string; protected: boolean };
  excerpt: { rendered: string; protected: boolean };
  author: number;
  featured_media: number;
  parent: number; // For hierarchical post types like pages
  comment_status: string;
  ping_status: string;
  sticky: boolean;
  template: string;
  format: string;
  meta: Record<string, any>;
  categories: number[];
  tags: number[];
  _embedded?: {
    'wp:featuredmedia'?: WordPressAPIMedia[];
    'wp:term'?: WordPressAPITerm[][];
    author?: WordPressAPIAuthor[];
  };
}

export interface WordPressAPIMedia {
  id: number;
  date: string;
  slug: string;
  type: string;
  link: string;
  title: { rendered: string };
  author: number;
  comment_status: string;
  ping_status: string;
  template: string;
  meta: Record<string, any>;
  description: { rendered: string };
  caption: { rendered: string };
  alt_text: string;
  media_type: string;
  mime_type: string;
  media_details: {
    width: number;
    height: number;
    file: string;
    sizes: Record<
      string,
      {
        file: string;
        width: number;
        height: number;
        mime_type: string;
        source_url: string;
      }
    >;
    image_meta: Record<string, any>;
  };
  source_url: string;
  _links: Record<string, any>;
}

export interface WordPressAPITerm {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  parent: number;
  meta: Record<string, any>;
}

export interface WordPressAPIAuthor {
  id: number;
  name: string;
  url: string;
  description: string;
  link: string;
  slug: string;
  avatar_urls: Record<string, string>;
  email?: string; // Available with authentication and context=edit
}

// Internal format for processing
export interface WordPressPost {
  id: string; // Sailor UUID
  wp_id?: number; // Original WordPress ID for mapping relationships
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  status: 'publish' | 'draft' | 'private';
  date: string;
  modified: string;
  categories: string[];
  tags: string[];
  author: string;
  author_email?: string;
  featured_image?: string;
  featured_image_metadata?: {
    alt?: string;
    title?: string;
    description?: string;
    caption?: string;
  };
  attachments: WordPressAttachment[];
  parent_id?: number; // WordPress parent ID for hierarchical content
}

export interface WordPressAttachment {
  id: string;
  title: string;
  url: string;
  name: string;
  mime_type: string;
  description?: string;
  alt?: string;
}

export interface WordPressAPIConfig {
  baseUrl: string; // e.g., "https://standal.no"
  username?: string; // For basic auth
  password?: string; // For basic auth (application password)
  apiKey?: string; // For API key auth
  timeout?: number; // Request timeout in ms
}

export interface WordPressImportOptions {
  collectionSlug: string;
  selectedPostType?: string; // The selected WordPress post type (post, page, etc.)
  downloadFiles?: boolean;
  createCategories: boolean;
  createTags: boolean;
  skipExistingSlugs: boolean;
  statusMapping: Record<string, 'draft' | 'published' | 'archived'>;
  fieldMappings: {
    content: string;
    excerpt: string;
    featured_image: string;
    categories: string;
  };
  fieldProcessing?: {
    content: 'keep-html' | 'strip-html' | 'markdown';
    excerpt: 'keep-html' | 'strip-html' | 'markdown';
  };
  authorMapping?: Record<string, string>;
  categoryCollectionSlug?: string; // Optional: which collection to use for categories
  // Author handling options
  useCurrentUserAsAuthor?: boolean; // If true, use current user ID as author
  currentUserId?: string; // Current user ID to use as author
  userEmailMap?: Record<string, string>; // Map of email -> user ID for author matching
  userNameMap?: Record<string, string>; // Map of name -> user ID for author matching
  // API-specific options
  apiConfig?: WordPressAPIConfig;
  postsPerPage?: number; // Default: 50
  maxPages?: number; // Limit number of pages to import
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  files: {
    imported: number;
    failed: number;
  };
}

export interface ImportProgressCallback {
  (processed: number, total: number, current: string): void;
}

export class WordPressImportService {
  /**
   * Helper method to get text content from an element by tag name
   */
  private static getTextContent(element: any, tagName: string): string | null {
    const elements = element.getElementsByTagName(tagName);
    return elements.length > 0 ? elements[0].textContent : null;
  }

  /**
   * Helper method to extract thumbnail ID from wp:postmeta elements
   */
  private static getThumbnailIdFromPostMeta(element: any): string | null {
    const postmetaElements = element.getElementsByTagName('wp:postmeta');

    for (let i = 0; i < postmetaElements.length; i++) {
      const metaElement = postmetaElements[i];
      const metaKey = this.getTextContent(metaElement, 'wp:meta_key');
      const metaValue = this.getTextContent(metaElement, 'wp:meta_value');

      if (metaKey === '_thumbnail_id' && metaValue) {
        return metaValue;
      }
    }

    return null;
  }

  /**
   * Parse WordPress date strings to Date objects
   */
  private static parseWordPressDate(dateString: string | null): Date | null {
    if (!dateString || dateString.trim() === '') {
      return null;
    }

    try {
      // WordPress dates are in format: "2014-10-07 13:08:47"
      // Use the same approach as the rest of the system - just create a Date object
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }

  /**
   * Parse WordPress XML export and convert to structured data
   */
  static async parseWordPressXML(xmlContent: string): Promise<{
    posts: WordPressPost[];
    attachments: WordPressAttachment[];
  }> {
    // Use a simple XML parser for Node.js environment
    const { DOMParser } = await import('@xmldom/xmldom');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');

    // Check for parsing errors
    const errors = doc.getElementsByTagName('parsererror');
    if (errors.length > 0) {
      throw new Error('Invalid XML format');
    }

    const posts: WordPressPost[] = [];
    const attachments: WordPressAttachment[] = [];
    const thumbnailIdToUrlMap: Map<string, string> = new Map();

    // First pass: Parse all attachments and build thumbnail ID to URL mapping
    const postElements = doc.getElementsByTagName('item');
    for (let i = 0; i < postElements.length; i++) {
      const element = postElements[i];
      const typeElements = element.getElementsByTagName('wp:post_type');
      const type = typeElements.length > 0 ? typeElements[0].textContent : null;

      if (type === 'attachment') {
        const attachment = this.parseAttachmentElement(element);
        if (attachment) {
          attachments.push(attachment);

          // Get the WordPress post ID for this attachment
          const wpPostId = this.getTextContent(element, 'wp:post_id');
          if (wpPostId && attachment.url) {
            thumbnailIdToUrlMap.set(wpPostId, attachment.url);
          }
        }
      }
    }

    // Second pass: Parse posts and use thumbnail mapping
    for (let i = 0; i < postElements.length; i++) {
      const element = postElements[i];
      const typeElements = element.getElementsByTagName('wp:post_type');
      const type = typeElements.length > 0 ? typeElements[0].textContent : null;

      if (type === 'post') {
        const post = this.parsePostElement(element, thumbnailIdToUrlMap);
        if (post) posts.push(post);
      }
    }

    return { posts, attachments };
  }

  /**
   * Parse a single post element from WordPress XML
   */
  private static parsePostElement(
    element: any,
    thumbnailIdToUrlMap?: Map<string, string>
  ): WordPressPost | null {
    try {
      const title = this.getTextContent(element, 'title') || '';
      const content = this.getTextContent(element, 'content:encoded') || '';
      const excerpt = this.getTextContent(element, 'excerpt:encoded') || '';
      const slug = this.getTextContent(element, 'wp:post_name') || '';
      const status = this.getTextContent(element, 'wp:status') || 'draft';
      const date = this.getTextContent(element, 'wp:post_date') || '';
      const modified = this.getTextContent(element, 'wp:post_modified') || '';
      const author = this.getTextContent(element, 'dc:creator') || '';

      // Parse categories and tags
      const categories: string[] = [];
      const tags: string[] = [];

      const categoryElements = element.getElementsByTagName('category');
      for (let i = 0; i < categoryElements.length; i++) {
        const catElement = categoryElements[i];
        const domain = catElement.getAttribute('domain');
        const text = catElement.textContent || '';

        if (domain === 'category') {
          categories.push(text);
        } else if (domain === 'post_tag') {
          tags.push(text);
        }
      }

      // Get featured image if available - try multiple possible fields
      let featuredImage =
        this.getTextContent(element, 'wp:attachment_url') ||
        this.getTextContent(element, 'wp:featured_image') ||
        this.getTextContent(element, 'wp:post_thumbnail') ||
        undefined;

      // If no featured image found, try to get from _thumbnail_id meta field
      if (!featuredImage && thumbnailIdToUrlMap) {
        const thumbnailId = this.getThumbnailIdFromPostMeta(element);
        if (thumbnailId) {
          featuredImage = thumbnailIdToUrlMap.get(thumbnailId);
        }
      }

      // If still no featured image found, try to extract from content
      if (!featuredImage) {
        const content = this.getTextContent(element, 'content:encoded') || '';
        // Look for image tags in content
        const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
        if (imgMatch) {
          featuredImage = imgMatch[1];
        }
      }

      return {
        id: crypto.randomUUID(),
        title,
        content,
        excerpt,
        slug,
        status: status as 'publish' | 'draft' | 'private',
        date,
        modified,
        categories,
        tags,
        author,
        featured_image: featuredImage,
        attachments: []
      };
    } catch (error) {
      console.error('Error parsing post element:', error);
      return null;
    }
  }

  /**
   * Parse a single attachment element from WordPress XML
   */
  private static parseAttachmentElement(element: any): WordPressAttachment | null {
    try {
      const title = this.getTextContent(element, 'title') || '';
      const url = this.getTextContent(element, 'wp:attachment_url') || '';
      const name = url.split('/').pop() || '';
      const mimeType = this.getTextContent(element, 'wp:attachment_mime_type') || '';
      const description = this.getTextContent(element, 'description') || '';
      const alt = this.getTextContent(element, 'wp:attachment_alt') || '';

      return {
        id: crypto.randomUUID(),
        title,
        url,
        name,
        mime_type: mimeType,
        description,
        alt
      };
    } catch (error) {
      console.error('Error parsing attachment element:', error);
      return null;
    }
  }

  /**
   * Detect junction table for categories relationship
   */
  private static async detectCategoryJunctionTable(
    collectionSlug: string,
    collectionFields: any,
    categoryCollectionSlug?: string
  ): Promise<{ junctionTable: string; categoryCollection: string } | null> {
    // Check if collection has categories field
    if (!collectionFields.categories) {
      return null;
    }

    // Categories are always stored in global_categories table
    const targetCategoryCollection = 'categories';

    // Common junction table naming patterns for categories
    const possibleTableNames = [
      `junction_${collectionSlug}_categories`,
      `junction_categories_${collectionSlug}`,
      `${collectionSlug}_categories`,
      `categories_${collectionSlug}`
    ];

    // Try to find the junction table in the schema
    for (const tableName of possibleTableNames) {
      try {
        if (schema[tableName as keyof typeof schema]) {
          return {
            junctionTable: tableName,
            categoryCollection: targetCategoryCollection
          };
        }
      } catch {
        // Table doesn't exist, continue
      }
    }

    // If no standard naming found, try to infer from the field configuration
    const categoriesField = collectionFields.categories;
    if (categoriesField?.type === 'relation' && categoriesField?.junction_table) {
      return {
        junctionTable: categoriesField.junction_table,
        categoryCollection: targetCategoryCollection
      };
    }

    return null;
  }

  /**
   * Import WordPress posts into a Sailor collection
   */
  static async importPosts(
    posts: WordPressPost[],
    options: WordPressImportOptions,
    onProgress?: ImportProgressCallback
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      errors: [],
      files: { imported: 0, failed: 0 }
    };

    // Get collection schema
    const collectionType = await db.query.collectionTypes.findFirst({
      where: (collectionTypes: any, { eq }: any) => eq(collectionTypes.slug, options.collectionSlug)
    });

    if (!collectionType) {
      result.success = false;
      result.errors.push(`Collection '${options.collectionSlug}' not found`);
      return result;
    }

    const collectionSchema = JSON.parse(collectionType.schema);
    const collectionFields = collectionSchema.properties || collectionSchema;

    // Use field mappings to determine what to import
    const fieldMappings = options.fieldMappings;

    // Only detect category junction table if categories field is mapped
    let categoryConfig = null;
    if (fieldMappings.categories) {
      categoryConfig = await this.detectCategoryJunctionTable(
        options.collectionSlug,
        collectionFields,
        options.categoryCollectionSlug
      );
    }

    // Create tags and categories if needed
    const allTags = new Set<string>();
    const allCategories = new Set<string>();

    posts.forEach((post) => {
      post.tags.forEach((tag) => allTags.add(tag));
      post.categories.forEach((cat) => allCategories.add(cat));
    });

    // Create tags
    if (options.createTags) {
      for (const tagName of allTags) {
        try {
          await TagService.createTag({ name: tagName });
        } catch (error) {
          console.warn(`Failed to create tag '${tagName}':`, error);
        }
      }
    }

    // Create categories in the target collection table
    const categoryMap = new Map<string, string>(); // categoryName -> categoryId

    if (options.createCategories && categoryConfig) {
      // Categories are always stored in global_categories table
      const categoryTableName = 'global_categories';

      for (const categoryName of allCategories) {
        try {
          // Get the category table from schema
          const categoryTable = schema[categoryTableName as keyof typeof schema];

          let existingCategory;
          if (categoryTable) {
            // Use typed query if table exists in schema
            const result = await db
              .select({ id: (categoryTable as any).id })
              .from(categoryTable)
              .where(eq((categoryTable as any).title, categoryName))
              .limit(1);
            existingCategory = result[0];
          } else {
            // Fallback to raw SQL for dynamic tables
            const result = await db.all(
              sql`SELECT id FROM ${sql.identifier(categoryTableName)} WHERE title = ${categoryName} LIMIT 1`
            );
            existingCategory = result[0];
          }

          if (existingCategory) {
            categoryMap.set(categoryName, existingCategory.id);
          } else {
            // Create new category
            const categoryId = crypto.randomUUID();
            const categoryData = {
              id: categoryId,
              title: categoryName,
              slug: generateSlug(categoryName),
              status: 'active',
              sort: 0,
              created_at: getCurrentTimestamp(),
              updated_at: getCurrentTimestamp()
            };

            if (categoryTable) {
              await db.insert(categoryTable).values(categoryData);
            } else {
              // Fallback to raw SQL
              await db.run(
                sql`INSERT INTO ${sql.identifier(categoryTableName)} 
                    (id, title, slug, status, sort, created_at, updated_at)
                    VALUES (${categoryId}, ${categoryName}, ${generateSlug(categoryName)}, 'active', 0, ${getCurrentTimestamp()}, ${getCurrentTimestamp()})`
              );
            }
            categoryMap.set(categoryName, categoryId);
          }
        } catch (error) {
          console.error(
            `Failed to create/find category '${categoryName}' in ${categoryTableName}:`,
            error
          );
          // Don't add to map if creation failed
        }
      }
    } else if (options.createCategories && !categoryConfig) {
      console.warn(
        `Categories creation requested but no category collection or junction table detected for '${options.collectionSlug}'`
      );
    }

    // Track downloaded images to avoid duplicates
    const imageCache = new Map<string, { id: string; url: string }>();

    // Create a map to track WordPress ID to Sailor UUID mapping for parent-child relationships
    const wpIdToSailorIdMap = new Map<number, string>();

    // Collect all WordPress parent IDs to understand hierarchy
    const postsWithParents: Array<{ wpId: number; sailorId: string; wpParentId: number }> = [];

    // Report initial progress
    onProgress?.(0, posts.length, 'Starting import...');

    // Import posts
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];

      // Report progress for current post
      onProgress?.(i, posts.length, `Importing "${post.title}"...`);

      try {
        // Map WordPress status to Sailor status
        const status = options.statusMapping[post.status] || 'draft';

        // Parse dates
        const createdDate = this.parseWordPressDate(post.date);
        const modifiedDate = this.parseWordPressDate(post.modified);

        // Determine author based on options - always use UUIDs
        let authorValue: string;
        if (options.useCurrentUserAsAuthor) {
          // Always use current user
          authorValue = options.currentUserId!;
        } else {
          // Try to match by email first, then by name, fallback to current user
          authorValue = options.currentUserId!; // Default fallback
          let matchFound = false;

          // Try email matching first (if available)
          if (post.author_email && options.userEmailMap) {
            const matchedUser = options.userEmailMap[post.author_email.toLowerCase()];
            if (matchedUser) {
              authorValue = matchedUser;
              matchFound = true;
            }
          }

          // Try name matching if no email match found
          if (!matchFound && post.author && options.userNameMap) {
            const matchedUser = options.userNameMap[post.author.toLowerCase()];
            if (matchedUser) {
              authorValue = matchedUser;
              matchFound = true;
            }
          }
        }

        // Prepare post data
        const postData: Record<string, any> = {
          id: post.id,
          title: post.title,
          slug: post.slug || generateSlug(post.title),
          status,
          author: authorValue,
          created_at: createdDate || getCurrentTimestamp(),
          updated_at: modifiedDate || getCurrentTimestamp()
        };

        // Handle content field (wysiwyg or textarea) and process images
        if (fieldMappings.content && collectionFields[fieldMappings.content]) {
          const {
            content: processedContent,
            downloadedImages,
            failedImages
          } = await this.processContentImages(post.content, imageCache, authorValue);

          // Apply content processing (HTML stripping, markdown conversion, etc.)
          const finalContent = options.fieldProcessing?.content
            ? this.processContent(processedContent, options.fieldProcessing.content)
            : processedContent;

          postData[fieldMappings.content] = finalContent;

          // Track content image statistics
          result.files.imported += downloadedImages;
          result.files.failed += failedImages;
        }

        // Handle excerpt field
        if (fieldMappings.excerpt && collectionFields[fieldMappings.excerpt]) {
          // Apply content processing (HTML stripping, markdown conversion, etc.)
          const processedExcerpt = options.fieldProcessing?.excerpt
            ? this.processContent(post.excerpt, options.fieldProcessing.excerpt)
            : post.excerpt;

          postData[fieldMappings.excerpt] = processedExcerpt;
        }

        // Handle tags - use the proper taggables system
        if (post.tags.length > 0 && options.createTags) {
          // We'll create the taggables after the post is inserted
          const tagsToCreate = post.tags;
          postData._tagsToCreate = tagsToCreate; // Store for later processing
        }

        // Handle categories if they exist as a relation field
        if (
          fieldMappings.categories &&
          collectionFields[fieldMappings.categories] &&
          options.createCategories
        ) {
          // Store categories for later processing through the junction table
          if (post.categories.length > 0) {
            postData._categoriesToCreate = post.categories;
          }
        }

        // Import featured image if available - always process through deduplication
        if (fieldMappings.featured_image && post.featured_image) {
          try {
            const imageFile = await this.downloadAndUploadFile(
              post.featured_image,
              imageCache,
              post.featured_image_metadata,
              undefined,
              authorValue
            );
            if (imageFile) {
              // Store the file ID for later processing
              postData._featuredImageFileId = imageFile.id;
              if (imageFile.wasDownloaded) {
                result.files.imported++;
              }
            } else {
              console.warn(`Failed to download/upload image for '${post.title}'`);
            }
          } catch (error) {
            console.warn(`Failed to import featured image for '${post.title}':`, error);
          }
        }

        // Remove temporary fields before insert
        const tagsToCreate = postData._tagsToCreate;
        const featuredImageFileId = postData._featuredImageFileId;
        const categoriesToCreate = postData._categoriesToCreate;
        delete postData._tagsToCreate;
        delete postData._featuredImageFileId;
        delete postData._categoriesToCreate;

        // Insert the post with slug handling based on options
        try {
          const collectionTable =
            schema[`collection_${options.collectionSlug}` as keyof typeof schema];
          if (collectionTable) {
            if (options.skipExistingSlugs) {
              // Check if slug exists and skip if it does
              const existingPost = await db
                .select({ id: (collectionTable as any).id })
                .from(collectionTable)
                .where(eq((collectionTable as any).slug, postData.slug))
                .limit(1);

              if (existingPost.length > 0) {
                result.skipped++;
                continue; // Skip to next post
              }
            } else {
              // Check if slug already exists and bump it if needed
              let finalSlug = postData.slug;
              let counter = 1;

              while (true) {
                const existingPost = await db
                  .select({ id: (collectionTable as any).id })
                  .from(collectionTable)
                  .where(eq((collectionTable as any).slug, finalSlug))
                  .limit(1);

                if (existingPost.length === 0) {
                  // Slug is available, use it
                  break;
                }

                // Slug exists, bump it
                finalSlug = `${postData.slug}-${counter}`;
                counter++;
              }

              // Update the slug if it was bumped
              if (finalSlug !== postData.slug) {
                postData.slug = finalSlug;
              }
            }

            // Insert with the final slug
            await db.insert(collectionTable).values(postData);
          } else {
            // Fallback to raw SQL if table not found in schema
            await db.run(
              sql`INSERT INTO ${sql.identifier(`collection_${options.collectionSlug}`)} 
                  (${sql.join(
                    Object.keys(postData).map((key) => sql.identifier(key)),
                    sql`, `
                  )})
                  VALUES (${sql.join(Object.values(postData), sql`, `)})`
            );
          }
        } catch (error) {
          throw error;
        }

        // Create taggables for tags
        if (tagsToCreate && tagsToCreate.length > 0) {
          for (const tagName of tagsToCreate) {
            try {
              const tag = await TagService.findOrCreateTag(tagName);
              // Create taggable relationship
              await db.insert(taggables).values({
                id: crypto.randomUUID(),
                tag_id: tag.id,
                taggable_type: `collection_${options.collectionSlug}`,
                taggable_id: post.id,
                created_at: getCurrentTimestamp()
              });
            } catch (error) {
              console.warn(`Failed to create taggable for tag '${tagName}':`, error);
            }
          }
        }

        // Create category relationships through junction table
        if (categoriesToCreate && categoriesToCreate.length > 0 && categoryConfig) {
          for (const categoryName of categoriesToCreate) {
            try {
              const categoryId = categoryMap.get(categoryName);
              if (categoryId) {
                const junctionTable = schema[categoryConfig.junctionTable as keyof typeof schema];
                if (junctionTable) {
                  await db.insert(junctionTable).values({
                    id: crypto.randomUUID(),
                    collection_id: post.id,
                    target_id: categoryId,
                    created_at: getCurrentTimestamp(),
                    updated_at: getCurrentTimestamp()
                  });
                } else {
                  // Fallback to raw SQL if table not found in schema
                  await db.run(
                    sql`INSERT INTO ${sql.identifier(categoryConfig.junctionTable)} 
                        (id, collection_id, target_id, created_at, updated_at)
                        VALUES (${crypto.randomUUID()}, ${post.id}, ${categoryId}, ${getCurrentTimestamp()}, ${getCurrentTimestamp()})`
                  );
                }
              } else {
                console.error(
                  `Category '${categoryName}' not found in category map. Available categories:`,
                  Array.from(categoryMap.keys())
                );
                console.error(`Category map contents:`, Object.fromEntries(categoryMap));
              }
            } catch (error) {
              console.error(`Failed to create category relationship for '${categoryName}':`, error);
            }
          }
        } else if (categoriesToCreate && categoriesToCreate.length > 0 && !categoryConfig) {
          console.warn(
            `Categories found in WordPress data but no junction table detected for collection '${options.collectionSlug}'. Categories will be skipped.`
          );
        }

        // Handle featured image - store file ID in the collection table if the field exists
        if (
          featuredImageFileId &&
          fieldMappings.featured_image &&
          fieldMappings.featured_image.trim() !== '' &&
          collectionFields[fieldMappings.featured_image]
        ) {
          try {
            const collectionTable =
              schema[`collection_${options.collectionSlug}` as keyof typeof schema];
            if (collectionTable) {
              // Validate that the field mapping is valid before attempting update
              const fieldName = fieldMappings.featured_image.trim();
              if (fieldName && collectionFields[fieldName]) {
                await db
                  .update(collectionTable)
                  .set({ [fieldName]: featuredImageFileId })
                  .where(eq((collectionTable as any).id, post.id));
              }
            } else {
              // Fallback to raw SQL for dynamic collection tables
              const fieldName = fieldMappings.featured_image.trim();
              if (fieldName && collectionFields[fieldName]) {
                await db.run(
                  sql`UPDATE ${sql.identifier(`collection_${options.collectionSlug}`)} 
                      SET ${sql.identifier(fieldName)} = ${featuredImageFileId} 
                      WHERE id = ${post.id}`
                );
              }
            }
          } catch (error) {
            console.warn(`Failed to update featured image for '${post.title}':`, error);
          }
        }

        // Track WordPress ID to Sailor ID mapping for parent relationships
        if (post.wp_id) {
          wpIdToSailorIdMap.set(post.wp_id, post.id);
        }

        // Track posts with parent relationships for later processing
        if (post.parent_id && post.parent_id > 0 && post.wp_id) {
          postsWithParents.push({
            wpId: post.wp_id,
            sailorId: post.id,
            wpParentId: post.parent_id
          });
        }

        result.imported++;
      } catch (error) {
        console.error(`Failed to import post '${post.title}':`, error);
        result.errors.push(
          `Failed to import '${post.title}': ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        result.skipped++;
      }
    }

    // Update parent relationships after all posts are imported
    if (postsWithParents.length > 0) {
      onProgress?.(
        posts.length,
        posts.length + postsWithParents.length,
        'Updating parent-child relationships...'
      );

      for (const postWithParent of postsWithParents) {
        try {
          const parentSailorId = wpIdToSailorIdMap.get(postWithParent.wpParentId);

          if (parentSailorId) {
            // Update the parent_id field in the collection table
            const collectionTable =
              schema[`collection_${options.collectionSlug}` as keyof typeof schema];

            if (collectionTable) {
              await db
                .update(collectionTable)
                .set({ parent_id: parentSailorId })
                .where(eq((collectionTable as any).id, postWithParent.sailorId));
            } else {
              // Fallback to raw SQL for dynamic collection tables
              await db.run(
                sql`UPDATE ${sql.identifier(`collection_${options.collectionSlug}`)} 
                    SET parent_id = ${parentSailorId} 
                    WHERE id = ${postWithParent.sailorId}`
              );
            }
          } else {
            console.warn(
              `Parent with WordPress ID ${postWithParent.wpParentId} not found for child ${postWithParent.sailorId}`
            );
          }
        } catch (error) {
          console.error(
            `Failed to update parent relationship for post ${postWithParent.sailorId}:`,
            error
          );
        }
      }
    }

    // Report completion
    onProgress?.(
      posts.length,
      posts.length,
      `Import completed: ${result.imported} imported, ${result.skipped} skipped${postsWithParents.length > 0 ? `, ${postsWithParents.length} hierarchical relationships established` : ''}`
    );

    return result;
  }

  /**
   * Download and upload a file from URL with deduplication
   */
  private static async downloadAndUploadFile(
    url: string,
    imageCache?: Map<string, { id: string; url: string }>,
    metadata?: { alt?: string; title?: string; description?: string; caption?: string },
    uploadDate?: Date,
    author?: string
  ): Promise<{ id: string; url: string; wasDownloaded: boolean } | null> {
    // Check cache first to avoid duplicate downloads
    if (imageCache?.has(url)) {
      const cached = imageCache.get(url)!;
      return { ...cached, wasDownloaded: false };
    }

    // Check if file already exists in database by URL first (exact match)
    try {
      const existingFileByUrl = await db.query.files.findFirst({
        where: (files: any, { eq }: any) => eq(files.url, url)
      });

      if (existingFileByUrl) {
        const result = {
          id: existingFileByUrl.id,
          url: existingFileByUrl.url,
          wasDownloaded: false
        };

        // Cache the result
        if (imageCache) {
          imageCache.set(url, { id: existingFileByUrl.id, url: existingFileByUrl.url });
        }

        return result;
      }
    } catch (dbError) {
      // If DB check fails, continue with download
      console.warn(`Failed to check for existing file by URL ${url}:`, dbError);
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const name = url.split('/').pop() || 'imported-file';

      // Create a File object from the blob
      const file = new File([blob], name, { type: blob.type });

      // Upload using utility function with metadata and date if available
      const uploadedFile = await uploadFile(file, {
        alt: metadata?.alt || '',
        title: metadata?.title || metadata?.caption || '',
        created_at: uploadDate, // Preserve WordPress upload date
        author: author || undefined // Use current user as author
      });

      // Check if this was a new upload by comparing the current time with created_at
      // If the file was just created, created_at should be very recent (within last 5 seconds)
      const now = Date.now();
      const createdAt = new Date(uploadedFile.created_at).getTime();
      const wasDownloaded = now - createdAt < 5000; // Within 5 seconds = likely new upload

      const result = {
        id: uploadedFile.id,
        url: uploadedFile.url || '',
        wasDownloaded
      };

      // Cache the result to avoid future downloads of the same URL
      if (imageCache && uploadedFile.url) {
        imageCache.set(url, { id: uploadedFile.id, url: uploadedFile.url });
      }

      return result;
    } catch (error) {
      console.error(`Failed to download and upload file from ${url}:`, error);
      return null;
    }
  }

  /**
   * Process content based on processing option
   */
  private static processContent(
    content: string,
    processing: 'keep-html' | 'strip-html' | 'markdown'
  ): string {
    if (!content) return content;

    switch (processing) {
      case 'strip-html':
        // Remove HTML tags and decode entities
        return content
          .replace(/<[^>]*>/g, '') // Strip HTML tags
          .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
          .replace(/&amp;/g, '&') // Decode common entities
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/\[&hellip;\]/g, '') // Remove WordPress ellipsis pattern
          .trim();

      case 'markdown':
        // Basic HTML to Markdown conversion
        return content
          .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
          .replace(/<b>(.*?)<\/b>/g, '**$1**')
          .replace(/<em>(.*?)<\/em>/g, '*$1*')
          .replace(/<i>(.*?)<\/i>/g, '*$1*')
          .replace(
            /<h([1-6])>(.*?)<\/h[1-6]>/g,
            (_, level, text) => '#'.repeat(parseInt(level)) + ' ' + text
          )
          .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
          .replace(/<br\s*\/?>/g, '\n')
          .replace(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)')
          .trim();

      case 'keep-html':
      default:
        return content;
    }
  }

  /**
   * Escape special characters for regex
   */
  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Extract image data (URLs + metadata) from HTML content
   */
  private static extractImageDataFromContent(
    content: string
  ): Array<{ url: string; alt?: string; title?: string }> {
    const imageData: Array<{ url: string; alt?: string; title?: string }> = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;

    while ((match = imgRegex.exec(content)) !== null) {
      const fullImgTag = match[0];
      const url = match[1];

      if (url && !imageData.find((img) => img.url === url)) {
        // Extract alt and title attributes
        const altMatch = fullImgTag.match(/alt=["']([^"']*)["']/i);
        const titleMatch = fullImgTag.match(/title=["']([^"']*)["']/i);

        imageData.push({
          url,
          alt: altMatch?.[1] || undefined,
          title: titleMatch?.[1] || undefined
        });
      }
    }

    return imageData;
  }

  /**
   * Extract all image URLs from HTML content (simplified method)
   */
  private static extractImageUrlsFromContent(content: string): string[] {
    return this.extractImageDataFromContent(content).map((img) => img.url);
  }

  /**
   * Download content images and replace URLs in content
   */
  private static async processContentImages(
    content: string,
    imageCache?: Map<string, { id: string; url: string }>,
    currentUserId?: string
  ): Promise<{ content: string; downloadedImages: number; failedImages: number }> {
    const imageData = this.extractImageDataFromContent(content);
    let processedContent = content;
    let downloadedImages = 0;
    let failedImages = 0;

    for (const imageInfo of imageData) {
      try {
        // Pass metadata extracted from HTML attributes
        const metadata = {
          alt: imageInfo.alt,
          title: imageInfo.title
        };

        const uploadedFile = await this.downloadAndUploadFile(
          imageInfo.url,
          imageCache,
          metadata,
          undefined,
          currentUserId
        );

        if (uploadedFile) {
          // Replace the URL in content with the new file URL
          processedContent = processedContent.replace(
            new RegExp(this.escapeRegExp(imageInfo.url), 'g'),
            uploadedFile.url
          );
          if (uploadedFile.wasDownloaded) {
            downloadedImages++;
          }
        } else {
          failedImages++;
          console.warn(`Failed to download content image: ${imageInfo.url}`);
        }
      } catch (error) {
        failedImages++;
        console.error(`Error processing content image ${imageInfo.url}:`, error);
      }
    }

    return { content: processedContent, downloadedImages, failedImages };
  }

  /**
   * Import WordPress posts from REST API
   */
  static async importFromAPI(
    options: WordPressImportOptions,
    onProgress?: ImportProgressCallback
  ): Promise<ImportResult> {
    if (!options.apiConfig) {
      throw new Error('API configuration is required for API import');
    }

    // Check if this is a media-only import
    if (options.collectionSlug === 'media-library') {
      return this.importMediaFromAPI(options.apiConfig, onProgress, options.currentUserId);
    }

    const result: ImportResult = {
      success: false,
      imported: 0,
      skipped: 0,
      errors: [],
      files: { imported: 0, failed: 0 }
    };

    try {
      // Fetch posts from WordPress API
      const posts = await this.fetchWordPressPosts(options.apiConfig, options, onProgress);

      if (posts.length === 0) {
        result.success = true;
        return result;
      }

      // Convert API posts to our internal format
      const convertedPosts = await this.convertAPIPostsToInternal(posts, options);

      // Import the posts using existing logic
      const importResult = await this.importPosts(convertedPosts, options, onProgress);

      return importResult;
    } catch (error) {
      console.error('WordPress API import failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Import only media files from WordPress REST API
   */
  static async importMediaFromAPI(
    apiConfig: WordPressAPIConfig,
    onProgress?: ImportProgressCallback,
    currentUserId?: string
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      imported: 0,
      skipped: 0,
      errors: [],
      files: { imported: 0, failed: 0 }
    };

    try {
      onProgress?.(0, 0, 'Fetching WordPress media files...');

      // Fetch media files from WordPress API
      const mediaFiles = await this.fetchWordPressMedia(apiConfig, onProgress);

      if (mediaFiles.length === 0) {
        result.success = true;
        onProgress?.(0, 0, 'No media files found to import');
        return result;
      }

      onProgress?.(0, mediaFiles.length, `Found ${mediaFiles.length} media files to import`);

      const imageCache = new Map<string, { id: string; url: string }>();

      // Import each media file
      for (let i = 0; i < mediaFiles.length; i++) {
        const mediaFile = mediaFiles[i];
        const currentProgress = i + 1;

        try {
          const fileName = mediaFile.title?.rendered || 'media file';
          onProgress?.(currentProgress, mediaFiles.length, `Processing ${fileName}...`);

          // Extract metadata and upload date
          const metadata = {
            alt: mediaFile.alt_text || undefined,
            title: mediaFile.title?.rendered || undefined,
            description: mediaFile.description?.rendered || undefined,
            caption: mediaFile.caption?.rendered || undefined
          };

          // Parse WordPress upload date
          const uploadDate = mediaFile.date ? new Date(mediaFile.date) : undefined;

          // Download and upload the media file with original date
          const uploadedFile = await this.downloadAndUploadFile(
            mediaFile.source_url,
            imageCache,
            metadata,
            uploadDate,
            currentUserId // Use current user as author for media imports
          );

          if (uploadedFile) {
            result.imported++; // Count all successful file operations as imported
            if (uploadedFile.wasDownloaded) {
              result.files.imported++; // Track newly downloaded files separately
              onProgress?.(currentProgress, mediaFiles.length, `Imported ${fileName}`);
            } else {
              onProgress?.(
                currentProgress,
                mediaFiles.length,
                `Skipped ${fileName} (already exists)`
              );
            }
          } else {
            result.skipped++;
            result.errors.push(
              `Failed to import media file: ${mediaFile.title?.rendered || mediaFile.source_url}`
            );
            onProgress?.(currentProgress, mediaFiles.length, `Failed to import ${fileName}`);
          }
        } catch (error) {
          result.files.failed++;
          result.errors.push(
            `Error importing ${mediaFile.title?.rendered || 'media file'}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          console.error(`Error importing media file ${mediaFile.id}:`, error);
        }
      }

      result.success = true;
      onProgress?.(
        mediaFiles.length,
        mediaFiles.length,
        `Import completed! ${result.imported} files imported`
      );

      return result;
    } catch (error) {
      console.error('WordPress media import failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Fetch media files from WordPress REST API
   */
  private static async fetchWordPressMedia(
    apiConfig: WordPressAPIConfig,
    onProgress?: ImportProgressCallback
  ): Promise<WordPressAPIMedia[]> {
    const mediaFiles: WordPressAPIMedia[] = [];
    const perPage = 50; // WordPress default
    const maxPages = 100; // Reasonable limit
    let currentPage = 1;

    while (currentPage <= maxPages) {
      const url = this.buildMediaAPIUrl(apiConfig.baseUrl, currentPage, perPage);
      onProgress?.(currentPage - 1, maxPages, `Fetching media page ${currentPage}...`);

      const response = await this.makeAPIRequest(url, apiConfig);

      if (!response.ok) {
        throw new Error(
          `WordPress Media API request failed: ${response.status} ${response.statusText}`
        );
      }

      // Check pagination headers
      const totalPages = response.headers.get('X-WP-TotalPages');

      const pageMedia: WordPressAPIMedia[] = await response.json();

      if (pageMedia.length === 0) {
        break; // No more media files
      }

      mediaFiles.push(...pageMedia);
      currentPage++;

      // Only break if we have no files AND we're beyond the expected total pages
      // Don't break just because we got fewer files - WordPress sometimes returns inconsistent page sizes
      if (totalPages && currentPage >= parseInt(totalPages)) {
        break;
      }
    }

    return mediaFiles;
  }

  /**
   * Build WordPress Media API URL
   */
  private static buildMediaAPIUrl(baseUrl: string, page: number, perPage: number): string {
    const cleanUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const url = new URL(`${cleanUrl}/wp-json/wp/v2/media`);

    url.searchParams.append('page', page.toString());
    url.searchParams.append('per_page', perPage.toString());
    url.searchParams.append('orderby', 'date');
    url.searchParams.append('order', 'desc');
    url.searchParams.append('status', 'inherit'); // Include all attachment statuses

    return url.toString();
  }

  /**
   * Fetch posts from WordPress REST API
   */
  private static async fetchWordPressPosts(
    apiConfig: WordPressAPIConfig,
    options: WordPressImportOptions,
    onProgress?: ImportProgressCallback
  ): Promise<WordPressAPIPost[]> {
    const posts: WordPressAPIPost[] = [];
    const postsPerPage = options.postsPerPage || 50;
    const maxPages = options.maxPages || 100; // Reasonable default
    let currentPage = 1;
    let totalPosts = 0;

    // First, get total count by fetching the first page
    onProgress?.(0, 0, 'Connecting to WordPress API...');

    while (currentPage <= maxPages) {
      const postType = options.selectedPostType || 'posts';
      const url = this.buildPreviewAPIUrl(apiConfig.baseUrl, currentPage, postsPerPage, postType);
      onProgress?.(currentPage - 1, maxPages, `Fetching page ${currentPage} from WordPress...`);

      const response = await this.makeAPIRequest(url, apiConfig);

      if (!response.ok) {
        throw new Error(`WordPress API request failed: ${response.status} ${response.statusText}`);
      }

      const pagePosts: WordPressAPIPost[] = await response.json();

      if (pagePosts.length === 0) {
        break; // No more posts
      }

      posts.push(...pagePosts);
      totalPosts += pagePosts.length;
      currentPage++;

      // If we got fewer posts than requested, we've reached the end
      if (pagePosts.length < postsPerPage) {
        break;
      }
    }

    onProgress?.(totalPosts, totalPosts, `Found ${totalPosts} posts to import`);

    return posts;
  }

  /**
   * Build WordPress API URL with proper parameters for authenticated import
   */
  private static buildAPIUrl(
    baseUrl: string,
    page: number,
    perPage: number,
    postType: string = 'posts'
  ): string {
    const cleanUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const url = new URL(`${cleanUrl}/wp-json/wp/v2/${postType}`);

    url.searchParams.set('page', page.toString());
    url.searchParams.set('per_page', perPage.toString());
    url.searchParams.set('_embed', 'true'); // Include embedded data (featured media, terms, etc.)
    url.searchParams.set('status', 'publish,draft,private'); // Get all post statuses with authentication
    url.searchParams.set('context', 'edit'); // Use edit context for authenticated requests

    return url.toString();
  }

  /**
   * Build WordPress API URL for preview (published posts only)
   */
  private static buildPreviewAPIUrl(
    baseUrl: string,
    page: number,
    perPage: number,
    postType: string = 'posts'
  ): string {
    const cleanUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const url = new URL(`${cleanUrl}/wp-json/wp/v2/${postType}`);

    url.searchParams.set('page', page.toString());
    url.searchParams.set('per_page', perPage.toString());
    url.searchParams.set('_embed', 'true'); // Include embedded data (featured media, terms, etc.)
    url.searchParams.set('status', 'publish'); // Only get published posts for preview

    return url.toString();
  }

  /**
   * Make authenticated request to WordPress API
   */
  private static async makeAPIRequest(
    url: string,
    apiConfig: WordPressAPIConfig
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'SailorCMS-Importer/1.0'
    };

    // Add authentication
    if (apiConfig.username && apiConfig.password) {
      const credentials = btoa(`${apiConfig.username}:${apiConfig.password}`);
      headers['Authorization'] = `Basic ${credentials}`;
    } else if (apiConfig.apiKey) {
      headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
    }

    const controller = new AbortController();
    const timeout = apiConfig.timeout || 30000; // 30 second default

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Convert WordPress API posts to internal format
   */
  private static async convertAPIPostsToInternal(
    apiPosts: WordPressAPIPost[],
    options: WordPressImportOptions
  ): Promise<WordPressPost[]> {
    const convertedPosts: WordPressPost[] = [];

    // No need to fetch detailed user information - use embedded author data

    for (const apiPost of apiPosts) {
      try {
        // Extract featured image URL and metadata
        let featuredImageUrl: string | undefined;
        let featuredImageMetadata:
          | { alt?: string; title?: string; description?: string; caption?: string }
          | undefined;

        if (apiPost.featured_media && apiPost._embedded?.['wp:featuredmedia']?.[0]) {
          const featuredMedia = apiPost._embedded['wp:featuredmedia'][0];
          featuredImageUrl = featuredMedia.source_url;

          // Extract image metadata
          featuredImageMetadata = {
            alt: featuredMedia.alt_text || undefined,
            title: featuredMedia.title?.rendered || undefined,
            description: featuredMedia.description?.rendered || undefined,
            caption: featuredMedia.caption?.rendered || undefined
          };

          // Remove empty values
          Object.keys(featuredImageMetadata).forEach((key) => {
            if (!featuredImageMetadata![key as keyof typeof featuredImageMetadata]) {
              delete featuredImageMetadata![key as keyof typeof featuredImageMetadata];
            }
          });

          // If no metadata, set to undefined
          if (Object.keys(featuredImageMetadata).length === 0) {
            featuredImageMetadata = undefined;
          }
        }

        // Extract categories and tags
        const categories: string[] = [];
        const tags: string[] = [];

        if (apiPost._embedded?.['wp:term']) {
          for (const termGroup of apiPost._embedded['wp:term']) {
            for (const term of termGroup) {
              if (term.taxonomy === 'category') {
                categories.push(term.name);
              } else if (term.taxonomy === 'post_tag') {
                tags.push(term.name);
              }
            }
          }
        }

        // Extract author name from embedded data - fallback to current user
        let authorName = 'Current User'; // Will be mapped to current user ID
        if (apiPost._embedded?.author?.[0] && !(apiPost._embedded.author[0] as any).code) {
          // Only use author name if it's not an error response
          authorName = apiPost._embedded.author[0].name || 'Current User';
        }

        // Extract content and excerpt based on field mappings (safely)
        const content = options.fieldMappings?.content ? apiPost.content?.rendered || '' : '';
        const excerpt = options.fieldMappings?.excerpt ? apiPost.excerpt?.rendered || '' : '';

        const convertedPost: WordPressPost = {
          id: crypto.randomUUID(),
          wp_id: apiPost.id, // Preserve original WordPress ID for relationship mapping
          title: apiPost.title?.rendered || '',
          content,
          excerpt,
          slug: apiPost.slug || '',
          status: apiPost.status as 'publish' | 'draft' | 'private',
          date: apiPost.date || '',
          modified: apiPost.modified || '',
          categories,
          tags,
          author: authorName,
          author_email: undefined,
          featured_image: featuredImageUrl,
          featured_image_metadata: featuredImageMetadata,
          attachments: [], // We'll handle attachments separately if needed
          parent_id: apiPost.parent || undefined // Capture parent ID for hierarchical content
        };

        convertedPosts.push(convertedPost);
      } catch (error) {
        console.error(`Failed to convert post ${apiPost.id}:`, error);
      }
    }

    return convertedPosts;
  }

  /**
   * Preview WordPress API data to show what's available for import
   */
  static async previewWordPressAPI(
    apiConfig: WordPressAPIConfig,
    options: { postsPerPage?: number; maxPages?: number } = {}
  ): Promise<{
    siteInfo: {
      name: string;
      description: string;
      url: string;
    };
    postTypes: Array<{
      name: string;
      label: string;
      count: number;
    }>;
    posts: Array<{
      id: number;
      title: string;
      slug: string;
      date: string;
      status: string;
      featured_image?: string;
      categories: string[];
      tags: string[];
    }>;
    totalPosts: number;
  }> {
    const postsPerPage = options.postsPerPage || 5;
    const maxPages = options.maxPages || 1;

    // First, get site info
    const siteInfoUrl = this.buildSiteInfoUrl(apiConfig.baseUrl);
    const siteResponse = await this.makeAPIRequest(siteInfoUrl, apiConfig);

    if (!siteResponse.ok) {
      throw new Error(
        `Failed to fetch site info: ${siteResponse.status} ${siteResponse.statusText}`
      );
    }

    const siteData = await siteResponse.json();

    // Get post types
    const postTypesUrl = this.buildPostTypesUrl(apiConfig.baseUrl);
    const postTypesResponse = await this.makeAPIRequest(postTypesUrl, apiConfig);

    if (!postTypesResponse.ok) {
      throw new Error(
        `Failed to fetch post types: ${postTypesResponse.status} ${postTypesResponse.statusText}`
      );
    }

    const postTypesData = await postTypesResponse.json();

    // Get a preview of posts
    const postsUrl = this.buildPreviewAPIUrl(apiConfig.baseUrl, 1, postsPerPage);
    const postsResponse = await this.makeAPIRequest(postsUrl, apiConfig);

    if (!postsResponse.ok) {
      throw new Error(`Failed to fetch posts: ${postsResponse.status} ${postsResponse.statusText}`);
    }

    const postsData: WordPressAPIPost[] = await postsResponse.json();

    // Get total posts count from headers
    const totalPosts = parseInt(postsResponse.headers.get('X-WP-Total') || '0');

    // Convert posts to preview format
    const previewPosts = postsData.map((post) => {
      // Extract featured image URL
      let featuredImageUrl: string | undefined;
      if (post.featured_media && post._embedded?.['wp:featuredmedia']?.[0]) {
        featuredImageUrl = post._embedded['wp:featuredmedia'][0].source_url;
      }

      // Extract categories and tags
      const categories: string[] = [];
      const tags: string[] = [];

      if (post._embedded?.['wp:term']) {
        for (const termGroup of post._embedded['wp:term']) {
          for (const term of termGroup) {
            if (term.taxonomy === 'category') {
              categories.push(term.name);
            } else if (term.taxonomy === 'post_tag') {
              tags.push(term.name);
            }
          }
        }
      }

      return {
        id: post.id,
        title: post.title.rendered,
        slug: post.slug,
        date: post.date,
        status: post.status,
        featured_image: featuredImageUrl,
        categories,
        tags
      };
    });

    // Convert post types to preview format
    // Show all post types and let the user decide what to import
    const previewPostTypes = Object.entries(postTypesData).map(([name, data]: [string, any]) => ({
      name: name === 'post' ? 'posts' : name === 'page' ? 'pages' : name, // Ensure plural for REST API endpoints
      label: data.name, // Use the 'name' field which contains the display name
      count: 0 // We'll show a simple indicator instead of exact counts
    }));

    return {
      siteInfo: {
        name: siteData.name || siteData.title || 'Unknown Site',
        description: siteData.description || '',
        url: siteData.url || apiConfig.baseUrl
      },
      postTypes: previewPostTypes,
      posts: previewPosts,
      totalPosts
    };
  }

  /**
   * Build WordPress site info API URL
   */
  private static buildSiteInfoUrl(baseUrl: string): string {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    return `${cleanUrl}/wp-json/`;
  }

  /**
   * Build WordPress post types API URL
   */
  private static buildPostTypesUrl(baseUrl: string): string {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    return `${cleanUrl}/wp-json/wp/v2/types`;
  }
}
