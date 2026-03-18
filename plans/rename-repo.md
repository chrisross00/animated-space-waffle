# Rename repo: animated-space-waffle → basil-budgeting

## Steps

### 1. Rename on GitHub (manual)
- Settings → General → Repository name → `basil-budgeting` → Rename
- GitHub auto-redirects old URL temporarily

### 2. Update local remote URL
```bash
git remote set-url origin git@github.com:chrisross00/basil-budgeting.git
```

### 3. Rename local folder
```bash
mv ~/Projects/animated-space-waffle ~/Projects/basil-budgeting
```

### 4. Update file references
| File | Line(s) | Change |
|------|---------|--------|
| `README.md` | 1 | Heading → `# basil-budgeting` |
| `CLAUDE.md` | 1 | `# Project: basil-budgeting ...` |
| `package-lock.json` | 2 | `"name": "basil-budgeting"` |
| `.env` | 20–21 | Remove stale Codespaces URLs |
| `.claude/settings.local.json` | 10 | Update hardcoded path |

### 5. Update server remote URL (SSH into Hetzner)
```bash
cd /opt/basil/app && git remote set-url origin git@github.com:chrisross00/basil-budgeting.git
```

## Not affected
- GitHub Actions workflow — uses `origin main` dynamically
- frontend/ and admin/ package.json — no repo name references
- Nginx, PM2, Docker configs — no repo name references
