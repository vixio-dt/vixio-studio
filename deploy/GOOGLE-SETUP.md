# Activate Google Drive storage (one-time, ~10 minutes)

The app is live at https://studio.vixio.app/ and works today on local storage.
To turn on "Sign in with Google" and store the workspace in your Google Drive
(the 5TB), create one OAuth credential in Google Cloud Console and paste it
into the app. Nothing is rebuilt; the Client ID is a runtime setting.

## 1. Create the OAuth Client ID

1. Go to https://console.cloud.google.com/ and pick or create a project
   (e.g. "Vixio Studio"). Use the `dt@vixiocreatives.com` account.
2. APIs & Services > Library > enable **Google Drive API**.
3. APIs & Services > OAuth consent screen:
   - If `vixiocreatives.com` is Google Workspace, choose **Internal** (only
     your org can sign in, no review, no test-user cap).
   - If it is a personal account, choose **External** and keep it in
     **Testing**, then add each team member under "Test users".
   - App name "Vixio Studio", support email your address. Save.
4. APIs & Services > Credentials > Create credentials > **OAuth client ID**:
   - Application type: **Web application**.
   - Name: "Vixio Studio web".
   - **Authorized JavaScript origins**: add `https://studio.vixio.app`
     (and `http://localhost:5180` if you also want it during local dev).
   - No redirect URI is needed (the app uses the token model).
   - Create, then copy the **Client ID** (looks like
     `xxxx…apps.googleusercontent.com`). There is no secret to handle.

The scope the app requests is `drive.file` plus `openid email profile`.
`drive.file` only ever touches files the app itself creates, so Google does
not require the sensitive-scope security review.

## 2. Paste it into the app

1. Open https://studio.vixio.app/ > Settings > Google Drive.
2. Paste the Client ID into "Google client id".
3. Click "Sign in with Google", choose your account, approve.

That signs you in (the account chip shows your email) and switches storage to
Drive. The app creates a "Vixio Studio" folder in your Drive; generated frames
and clips upload there and the project graph is mirrored as
`vixio-workspace.json`. Open the app on another device, sign in, and the
workspace rehydrates from Drive.

## Team pooling on the 5TB

- Workspace account: create a **Shared Drive** named "Vixio Studio" and give
  the team edit access; members sign in with their own accounts and the files
  pool on the Workspace storage. (A follow-up can point the app at a shared
  folder id.)
- Personal account: each member signs in to their own Drive. To pool on
  `dt@`'s 5TB specifically, everyone signs in as `dt@`, or use a Shared Drive
  via Workspace.

## Redeploy / update

Push to `main` rebuilds the GHCR image (`.github/workflows/image.yml`); then
re-run the Hostinger deploy (VPS_createNewProjectV1, project `vixio-studio`,
`deploy/studio.compose.yml`) which pulls the new image with `pull_policy: always`.
