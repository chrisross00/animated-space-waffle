#!/bin/bash
# Check Sentry for unresolved issues — run as a Claude Code session start hook.
# Requires SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT env vars.
#
# To set up:
# 1. Create a Sentry API token at https://sentry.io/settings/auth-tokens/
#    (needs project:read scope)
# 2. Add to your shell profile or Claude Code settings:
#    export SENTRY_AUTH_TOKEN="sntrys_..."
#    export SENTRY_ORG="your-org-slug"
#    export SENTRY_PROJECT="your-project-slug"

if [ -z "$SENTRY_AUTH_TOKEN" ] || [ -z "$SENTRY_ORG" ] || [ -z "$SENTRY_PROJECT" ]; then
  echo "OK"
  exit 0
fi

RESPONSE=$(curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&limit=5&statsPeriod=24h" \
  2>/dev/null)

if [ $? -ne 0 ] || [ -z "$RESPONSE" ]; then
  echo "OK"
  exit 0
fi

# Check if response is a valid JSON array with items
COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data))" 2>/dev/null)

if [ -z "$COUNT" ] || [ "$COUNT" = "0" ]; then
  echo "OK"
  exit 0
fi

echo "Sentry: $COUNT unresolved issue(s) in the last 24h:"
echo "$RESPONSE" | python3 -c "
import sys, json
issues = json.load(sys.stdin)
for i in issues[:5]:
    title = i.get('title', 'Unknown')
    count = i.get('count', '?')
    level = i.get('level', '?')
    link = i.get('permalink', '')
    print(f'  [{level}] {title} ({count}x)')
    if link:
        print(f'    {link}')
" 2>/dev/null
