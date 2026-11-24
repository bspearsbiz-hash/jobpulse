#!/usr/bin/env bash
# Job Pulse safety check. Runs before every commit (see .githooks/pre-commit).
# Blocks: secrets, plaintext member data, client emails/phones, and commit
# messages that name members. Run by hand: bash tools/guard.sh [commit-msg-file]
set -u
fail=0
say() { echo "GUARD BLOCKED: $1" >&2; fail=1; }

files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
[ -z "$files" ] && files=$(git ls-files)

for f in $files; do
  [ -f "$f" ] || continue
  case "$f" in *.mp4|*.jpg|*.jpeg|*.png|*.gif|*.webp|*.ico|tools/guard.sh) continue;; esac
  case "$f" in
    .env|.env.*|*.env|*.pem|*.key|*.p12|*.plain.json|*client*.json|*.csv|*.xlsx|*.docx|*.pdf)
      say "$f is a file type that must never be committed (secrets or client data)";;
  esac
  # Secrets and live keys
  if grep -I -n -E 'sk_(live|test)_[A-Za-z0-9]{8,}|rk_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_|xox[bpa]-|-----BEGIN [A-Z ]*PRIVATE KEY|service_role|SG\.[A-Za-z0-9_-]{20,}' "$f" >/dev/null 2>&1; then
    say "$f contains what looks like a secret key"
  fi
  # Member data must only ever be the encrypted box format
  case "$f" in c/*.json)
    grep -q '"v":1,"s":"' "$f" && ! grep -q '"apps"' "$f" || say "$f is not encrypted member data";;
  esac
  # Personal contact info (anything other than the business inbox)
  if grep -I -o -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$f" 2>/dev/null | grep -v -i -E '^(bspearsbiz@gmail\.com|noreply@anthropic\.com)$' | grep -q .; then
    say "$f contains an email address that is not the business inbox"
  fi
  if grep -I -n -E '\(?\b[2-9][0-9]{2}\)?[-. ][0-9]{3}[-. ][0-9]{4}\b' "$f" >/dev/null 2>&1; then
    say "$f contains what looks like a phone number"
  fi
  # Access codes in plain text
  if grep -I -o -E 'JP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}' "$f" 2>/dev/null | grep -v -q -x 'JP-XXXX-XXXX-XXXX'; then
    say "$f contains a member access code"
  fi
done

# Commit message must not name members (pass the message file as $1)
if [ "${1:-}" ] && [ -f "$1" ]; then
  names_file="$(git rev-parse --show-toplevel)/.git/jp-member-names"
  if [ -f "$names_file" ] && grep -v '^#' "$1" | grep -i -w -F -f "$names_file" >/dev/null; then
    say "commit message names a member. Use a generic message like 'Portal: member data update'"
  fi
fi

[ $fail -eq 0 ] && echo "guard: clean" >&2
exit $fail
