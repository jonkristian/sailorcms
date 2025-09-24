---
layout: default
title: Core Concepts
nav_order: 4
has_children: true
---

# Core Concepts

Understanding Sailor CMS's fundamental concepts will help you build powerful, type-safe content management systems.

## Template-Driven Architecture

Sailor CMS uses a template-driven approach where you define your content structure using TypeScript. This provides:

- **Type Safety**: Full TypeScript support for your content models
- **Developer Experience**: IntelliSense and compile-time validation
- **Flexibility**: Easy to extend and modify your content structure

## Key Components

### Collections
Collections are your main content types - like blog posts, products, or pages. Each collection is defined by a template that specifies its fields and behavior.

### Blocks
Reusable content components that can be used within collections or as standalone elements. Perfect for building flexible page layouts.

### Globals
Site-wide settings and content that appear across multiple pages, like navigation menus, site settings, or contact information.

### Fields
The building blocks of your content structure. Sailor provides many field types from simple text inputs to complex relationship fields.

---

## Next Steps

- [Learn about Templates]({{ site.baseurl }}{% link core-concepts/templates.md %})
- [Explore Field Types]({{ site.baseurl }}{% link core-concepts/field-types.md %})