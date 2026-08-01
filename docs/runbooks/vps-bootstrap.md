# VPS bootstrap + M0 verification

One-time setup of the private VPS that will run vixio-studio, and the M0
spike that settles the last architectural unknown (headless Claude Code
auth + Higgsfield MCP reachability). Run top to bottom as root once; every
later session works as the `vixio` user.

## 1. Non-root user (5 minutes that remove the worst failure modes)

```bash
adduser --disabled-password --gecos "" vixio
mkdir -p /srv/vixio && chown vixio:vixio /srv/vixio
# Optional: docker access (note: docker group is root-equivalent, but it
# still keeps npm postinstall scripts and stray rm -rf out of /).
usermod -aG docker vixio
su - vixio
```

Everything below runs as `vixio`.

## 2. Tooling

```bash
# Node 22 (via nvm or distro package) + git; then:
npm install -g @anthropic-ai/claude-code
claude --version   # expect >= 2.1.220
```

## 3. Subscription auth for headless use

On any machine with a browser where you are logged into Claude:

```bash
claude setup-token   # prints a long-lived OAuth token; copy it
```

On the VPS:

```bash
install -m 600 /dev/null ~/.vixio-env
cat >> ~/.vixio-env <<'EOF'
export CLAUDE_CODE_OAUTH_TOKEN="<paste token>"
EOF
echo 'source ~/.vixio-env' >> ~/.bashrc
```

The token needs manual rotation if it ever expires — the app surfaces
`authentication_failed` retry events as a "re-auth needed" banner rather
than stalling, but the fix is rerunning `setup-token` and updating this
file.

## 4. Repos

```bash
cd /srv/vixio
git clone git@github.com:vixio-dt/vixio-studio.git
git clone git@github.com:vixio-dt/howl-to-heaven.git
```

(Use a deploy key or fine-grained PAT scoped to these two repos.)

## 5. Higgsfield MCP for headless sessions

```bash
cd /srv/vixio/howl-to-heaven
claude mcp add --transport http higgsfield https://mcp.higgsfield.ai/mcp
claude            # interactive once: run /mcp, complete the OAuth sign-in
```

The credential persists in the user keychain/credentials file; headless
runs afterwards reuse it. If the interactive step is impossible on the
VPS (no browser), complete the OAuth on a machine that has one and copy
`~/.claude.json` + `~/.claude/.credentials.json` across (0600).

## 6. M0 verification — run this before building anything on the VPS

Three checks, in order; each must pass. All are cheap.

```bash
# (a) Headless subscription auth works
claude --bare -p "Reply with exactly: M0-AUTH-OK" \
  --output-format json | tee /tmp/m0-auth.json
# PASS: .result contains M0-AUTH-OK and no auth error events

# (b) Higgsfield tools reachable in a headless run (NOT --bare: MCP must load)
cd /srv/vixio/howl-to-heaven
claude -p "Call the Higgsfield balance tool and reply with exactly the JSON it returns." \
  --allowedTools "mcp__higgsfield__balance" --output-format json | tee /tmp/m0-mcp.json
# PASS: .result contains {"credits": ...}. FAIL modes: server listed as
# "needs authentication" (redo step 5) or absent (check `claude mcp list`).

# (c) canUseTool interception (SDK-level) — proves the app's approval gate
cd /srv/vixio/vixio-studio && npm install
node scripts/m0-canusetool.mjs
# PASS: prints "M0-GATE-OK: edit was intercepted and denied; file unchanged"
```

Record the three outcomes in the session that continues the build. If (b)
fails both the connector and explicit-server routes, the architecture's
documented fallback applies (generation via interactive Claude Code
sessions; everything else unchanged).

## 7. App deployment (after M1/M2 land)

`docker compose up -d` from vixio-studio once the compose file ships:
`app` (server + built SPA, claude CLI in image, `~/.claude*` on a named
volume so container rebuilds keep the MCP OAuth), `caddy` (TLS; bind to
Tailscale/WireGuard interface — the app is single-user and must not face
the open internet even with basic auth).
