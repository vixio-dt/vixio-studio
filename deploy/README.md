# Vixio Studio team asset drive: deploy runbook

This turns Vixio Studio from a single-browser app into a team tool: a shared
cloud drive on your Hostinger VPS that stores generated frames, clips, and
portraits, with logins, sharing, and delete across the team. It runs behind
the Traefik that is already on the box, and deploys through the Hostinger API
(no SSH needed).

## What it is

- **PocketBase** (`deploy/asset-drive.compose.yml`): one small container giving
  auth, a database, on-disk file storage, per-team access rules, and realtime.
- **Schema** (`deploy/pb_schema.json`): `workspaces`, `members`, `projects`
  (the scene/shot/character graph lives in one JSON field per project), and
  `assets` (the large, individually shareable and deletable blobs, with a
  `thumb` for cheap grids). `assets.kind` already includes `audio` for later.
- **Client sync** (not built yet): a `remote` tier behind the app's existing
  asset-store interface, so the frame lab, rails, and timeline keep working
  unchanged. See "Client work still to do" below.

Design choices worth knowing: the project graph syncs as one record
(last-write-wins per project, fine for a small team); only assets sync
individually, because they are the things you share and delete. Frames are
re-encoded to WebP and a thumbnail is generated client-side before upload, so
1 GB of disk holds many projects and egress stays small (the same frugality
that made Supabase Free viable applies here, except you have 200 GB and 16 TB).

## VPS facts (captured 2026-06-16)

- VM id `1612727`, IPv4 `187.127.113.17`, IPv6 `2a02:4780:5e:b48::1`.
- Traefik: host networking, entrypoints `web`/`websecure`, auto HTTP to HTTPS,
  cert resolver `letsencrypt` (HTTP challenge), routes only `traefik.enable=true`.
- A protective snapshot was taken before any change (action `99504749`).
- The whole `vixiowork` stack (desk, webtop, hermes, paperclip, vx-hello) is
  Multica. Retiring it frees disk and lets the firewall close the UDP range.

## Step 1: pick the host and add DNS

Choose one host for the drive and point an A record at the VPS. The app itself
stays on GitHub Pages for now (or can move to Traefik later).

| Option | Drive host | DNS record to add |
| --- | --- | --- |
| vixio.app | `drive.vixio.app` | A `drive` -> `187.127.113.17` |
| vixiocreatives.com | `drive.vixiocreatives.com` | A `drive` -> `187.127.113.17` |
| keens.asia | `drive.keens.asia` | A `drive` -> `187.127.113.17` |

DNS is added via the Hostinger API (`DNS_updateDNSRecordsV1`), TTL 300.

## Step 2: deploy the drive

Single API call (`VPS_createNewProjectV1`):

- `virtualMachineId`: `1612727`
- `project_name`: `vixio-drive`
- `environment`: `STUDIO_API_HOST=drive.vixio.app` (your chosen host)
- `content`: the contents of `asset-drive.compose.yml`

Traefik issues the TLS cert automatically once DNS resolves. Verify:
`https://drive.vixio.app/api/health` returns `{"message":"API is healthy."}`.

## Step 3: first-run setup

1. Open `https://<host>/_/` and create the PocketBase admin account.
2. Settings > Import collections > paste `pb_schema.json`.
3. Settings > Mail: point SMTP at your domain (or Resend, already in the
   website stack) so team invites and password resets send.
4. Create the first workspace and invite the team as members.

## Step 4: lock down the firewall (do last)

No firewall is attached today (`firewall_group_id: null`). Once the drive is
confirmed working and Multica's fate is decided:

- Create a firewall (`VPS_createNewFirewallV1`), add inbound rules for 22, 80,
  443, attach it (`VPS_activateFirewallV1`).
- If Multica is being kept, also allow UDP 56000-56100 (neko WebRTC).
- Recommended alongside: SSH to keys only, password auth off.

## Rollback

- Remove the drive: `VPS_deleteProjectV1` for `vixio-drive` (the named volumes
  hold the data; deleting the project keeps them unless pruned).
- Full restore: `VPS_restoreSnapshotV1` to snapshot `99504749`.

## Client work still to do (the app side)

1. `src/remote/drive.ts`: PocketBase client, auth, workspace selection.
2. Widen the asset store: in-memory index -> IndexedDB cache -> drive. Uploads
   run in the background after a generation; opening a project pulls the asset
   index and lazy-fetches blobs not yet cached. Offline keeps working.
3. WebP re-encode + thumbnail generation in the upload path.
4. Move the project graph (currently localStorage) to the `projects.graph`
   field, synced on change.
5. A shared library view (artcraft's GalleryModal pattern): team-wide,
   date-grouped, filter by kind/project/creator, multi-select delete,
   "use as reference".
6. Auth screen + workspace switcher in the app shell.
7. A retention job (PocketBase cron hook): delete unattached takes after N days.

Estimate: about a day for items 1-6, plus the retention hook.
