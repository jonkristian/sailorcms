---
layout: default
title: Contributing
nav_order: 8
---

# Contributing to Sailor

Thank you for considering contributing to Sailor CMS!

## Getting Started

**Prerequisites:**

- Node.js 20+
- Git
- Basic knowledge of SvelteKit, TypeScript

**Setup:**

1. Fork and clone the repository
2. Run `npm install`
3. Create `.env` file with `BETTER_AUTH_SECRET` and `DATABASE_URL`
4. Run `npx sailor db:update`
5. Run `npm run dev`
6. Visit http://localhost:5173/sailor

## Project Structure

```
src/lib/sailor/
├── templates/       # Define content types here
├── generated/       # Auto-generated (don't edit)
├── core/           # Core CMS functionality
└── scripts/        # Utility scripts

src/routes/sailor/   # Admin interface
src/components/sailor/ # Admin UI components
```

## Development Guidelines

**Code Style:**

- TypeScript for all new code
- Run `npm run lint` before submitting
- Follow existing patterns

**Before Contributing:**

1. Check existing issues
2. Open an issue for new features
3. Keep PRs focused
4. Test your changes

## Types of Contributions

**Bug Fixes:** Include reproduction steps and reference issue number

**New Features:** Discuss in issue first, follow existing patterns

**Documentation:** Fix typos, add examples, keep current

**UI/UX:** Follow design patterns, test on mobile/desktop

## Development Workflow

**Adding Collections/Blocks:**

1. Create template in appropriate folder
2. Register in index file
3. Run `npx sailor db:update`
4. Test in admin interface

**Important Rules:**

- Never edit generated files
- Always use templates for schema changes
- Test with existing data

## Pull Request Process

1. Create feature branch from `master`
2. Make changes following guidelines
3. Test thoroughly (dev server, linting, TypeScript)
4. Commit with clear message
5. Open PR with description and screenshots

## What Not to Do

- Don't edit generated files in `src/lib/sailor/generated/`
- Don't modify shadcn/ui components
- Don't commit database files
- Don't include sensitive data

## Getting Help

- GitHub Issues for bugs and features
- Check existing documentation first

---

**Thank you for helping make Sailor CMS better!**
