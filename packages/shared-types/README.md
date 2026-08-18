# WasteWise AI — Shared Types

This package will hold TypeScript types generated from the backend's
OpenAPI schema, ensuring frontend-backend type safety.

## Usage (Phase 1+)

```bash
# Generate types from the running backend's OpenAPI spec
npx openapi-typescript http://localhost:8000/openapi.json -o ./types.ts
```

## Status

Placeholder — will be populated once the backend API surface stabilizes
in Phase 1.
