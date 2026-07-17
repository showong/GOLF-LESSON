# Source snapshot

- Created: 2026-07-17 Asia/Seoul
- Source: `/Users/judefive/Projects/project/GOLF-LESSON-DEPLOY`
- Source branch: `codex/deployment-foundation`
- Source commit: `9235acdaa9296afa45b7e5be24a514ac325076ad`
- Destination: `/Users/judefive/Projects/project/GOLF-LESSON-APP`

The source worktree contained tracked modifications and untracked deployment files. The application source and local configuration were copied as a working snapshot. Git metadata, installed dependencies, build output, and runtime database files were intentionally excluded.

Excluded paths:

- `.git`
- `node_modules`
- `.next`
- `data`
- common OS and test cache files

Recreate the local application with:

1. `npm ci`
2. `npm run test`
3. `npm run build`
