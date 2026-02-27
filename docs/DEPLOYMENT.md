# Deployment Guide

## Prerequisites

- Node.js 20+
- Supabase project configured
- Required environment variables configured from `.env.example`

## Deploy Steps

1. Install dependencies:
   - `npm ci`
2. Validate environment:
   - Ensure all required vars are available at runtime.
3. Apply database migrations:
   - `npm run db:migrate`
4. Run quality checks:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
5. Build:
   - `npm run build`
6. Start:
   - `npm run start`

## Rollback

1. Roll back application deploy to previous version in hosting platform.
2. If migration rollback is needed, apply a compensating migration.
3. Verify health endpoint:
   - `GET /api/health`
