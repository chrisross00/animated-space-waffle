---
paths: Dockerfile, docker-compose.yml, .github/workflows/**, shared/**
---
# Deployment Rules

1. **New top-level directories need Dockerfile COPY updates.** The Dockerfile explicitly
   lists which directories are copied into the container. Check both the build stage
   and runtime stage.

2. **Deploy through git push only.** Push to main triggers CI/CD (test → deploy).
   Manual `scp` to production blocks `git pull` on the server.

3. **Do not amend commits that have been pushed.** Force-push causes divergent branches
   on the production server. Create a new commit instead.

4. **Do not skip hooks or bypass signing** unless the user explicitly asks.

5. **Run migrations locally after creating them:**
   `psql "postgresql://chris@localhost/basil" -f db/migrations/XXX.sql`
