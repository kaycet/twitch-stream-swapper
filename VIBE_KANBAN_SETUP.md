# Vibe Kanban Configuration

## Project Scripts

The project is configured with the following scripts for Vibe Kanban:

### Setup Script
```bash
npm run setup
```
Runs before the coding agent starts. Currently just a placeholder (Chrome extensions don't need a build step).

### Dev Server Script
```bash
npm run dev
```
Starts a local HTTP server on port 8080 for testing. Opens `dev.html` in browser.

### Validation Script
```bash
npm run validate
```
Validates the extension structure, checks for required files, and validates manifest.json.

### Other Scripts
- `npm test` - Placeholder for test commands
- `npm run format` - Placeholder for formatting
- `npm run lint` - Placeholder for linting

## Vibe Kanban Configuration

The `.vibe-kanban-config.json` file contains:
- **Setup Script**: `npm run setup`
- **Dev Server Script**: `npm run dev` 
- **Cleanup Script**: `npm run format`
- **Copy Files**: Environment files (if needed)

## Configuring in Vibe Kanban UI

1. **Go to Project Settings** (gear icon on your project)
2. **Setup Script**: `npm run setup`
3. **Dev Server Script**: `npm run dev` (optional, for preview)
4. **Cleanup Script**: `npm run format` (optional)

## Testing the Setup

Run validation to check everything:
```bash
npm run validate
```

This will check:
- ✅ All required files exist
- ✅ Manifest.json is valid
- ⚠️  Icons (warns if missing but doesn't fail)

## Next Steps

1. Configure these scripts in Vibe Kanban project settings
2. Create your first task
3. The agent will run `npm run setup` before starting work
4. Review changes in Vibe Kanban's diff view
5. Merge when ready!

