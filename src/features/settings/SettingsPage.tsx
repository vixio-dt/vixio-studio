import { ArrowLeft, CheckCircle, CloudCheck, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { signIn, signOut } from "@/cloud/sync";
import { BusyDots, Button, Dialog, Field, Segmented, TextInput } from "@/components/ui";
import type { ModelInfo } from "@/domain/modelRegistry";
import { modelsFor } from "@/domain/modelRegistry";
import type { Result } from "@/lib/result";
import { useSessionStore } from "@/stores/session";
import type { AudioProviderChoice, ProviderChoice } from "@/stores/settings";
import { useSettingsStore } from "@/stores/settings";

import { settingsCopy } from "./copy";
import {
  verifyElevenLabsKey,
  verifyFalKey,
  verifyGeminiKey,
  verifyMeshyKey,
} from "./verify";

/**
 * Settings: a quiet full page outside the workspace shell. Sections separated
 * by hairlines: provider routing, one section per provider (key with an
 * inline Verify check, then model ids), Drive sync, and the local data danger
 * row. Everything binds straight to the settings store, which persists
 * synchronously to localStorage.
 */

const PROVIDER_OPTIONS = [
  { value: "vixio-preview", label: settingsCopy.providers.preview },
  { value: "gemini", label: settingsCopy.providers.gemini },
  { value: "fal", label: settingsCopy.providers.fal },
] as const satisfies readonly { value: ProviderChoice; label: string }[];

const AUDIO_PROVIDER_OPTIONS = [
  {
    value: "vixio-preview",
    label: settingsCopy.providers.preview,
    testId: "audio-provider-preview",
  },
  {
    value: "elevenlabs",
    label: settingsCopy.providers.elevenlabs,
    testId: "audio-provider-elevenlabs",
  },
  { value: "fal", label: settingsCopy.providers.fal, testId: "audio-provider-fal" },
] as const satisfies readonly {
  value: AudioProviderChoice;
  label: string;
  testId: string;
}[];

type ProviderRowProps<TValue extends string> = {
  label: string;
  hint: string;
  options: readonly { value: TValue; label: string; testId?: string }[];
  value: TValue;
  onChange: (value: TValue) => void;
};

/** One generation kind: label and hint left, segmented choice right. Stacks below 640px. */
const ProviderRow = <TValue extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: ProviderRowProps<TValue>) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-medium text-fg-secondary">{label}</span>
      <span className="text-xs text-fg-muted">{hint}</span>
    </div>
    <Segmented
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel={label}
      size="sm"
    />
  </div>
);

/* ------------------------------------------------------------------ */
/* Key field with inline verification                                  */
/* ------------------------------------------------------------------ */

type VerifyStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "valid" }
  | { state: "invalid"; message: string };

type VerifiedKeyFieldProps = {
  label: string;
  helper: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  inputTestId: string;
  verifyTestId: string;
  verify: (key: string) => Promise<Result<null>>;
};

/**
 * Password input with a Verify action beside it. The check result renders
 * inline below the row: checking, accepted, or the provider's own error
 * string. Editing the key resets the state to idle.
 */
const VerifiedKeyField = ({
  label,
  helper,
  placeholder,
  value,
  onChange,
  inputTestId,
  verifyTestId,
  verify,
}: VerifiedKeyFieldProps) => {
  const [status, setStatus] = useState<VerifyStatus>({ state: "idle" });

  const handleVerify = async () => {
    const key = value.trim();
    if (key.length === 0) {
      setStatus({ state: "invalid", message: settingsCopy.verify.emptyKey });
      return;
    }
    setStatus({ state: "checking" });
    const result = await verify(key);
    setStatus(
      result.ok
        ? { state: "valid" }
        : { state: "invalid", message: result.error.message },
    );
  };

  return (
    <Field label={label} helper={helper}>
      {({ inputId, describedBy }) => (
        <>
          <div className="flex gap-2">
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              type="password"
              autoComplete="off"
              data-testid={inputTestId}
              placeholder={placeholder}
              value={value}
              onChange={(event) => {
                onChange(event.target.value);
                if (status.state !== "idle") setStatus({ state: "idle" });
              }}
              className="flex-1"
            />
            <Button
              variant="outline"
              data-testid={verifyTestId}
              busy={status.state === "checking"}
              onClick={() => {
                void handleVerify();
              }}
            >
              {settingsCopy.verify.action}
            </Button>
          </div>
          {status.state === "checking" ? (
            <p
              role="status"
              className="inline-flex items-center gap-2 text-xs text-fg-muted"
            >
              <BusyDots />
              {settingsCopy.verify.checking}
            </p>
          ) : status.state === "valid" ? (
            <p
              role="status"
              className="inline-flex items-center gap-1.5 text-xs text-fg-secondary"
            >
              <CheckCircle size={14} className="text-accent" aria-hidden />
              {settingsCopy.verify.valid}
            </p>
          ) : status.state === "invalid" ? (
            <p role="alert" className="text-xs text-danger">
              {status.message}
            </p>
          ) : null}
        </>
      )}
    </Field>
  );
};

/* ------------------------------------------------------------------ */
/* Model id field with a registry-fed datalist                         */
/* ------------------------------------------------------------------ */

type ModelFieldProps = {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
  /** Registry suggestions; the input stays free text either way. */
  models?: readonly ModelInfo[];
  listId?: string;
};

const ModelField = ({
  label,
  helper,
  value,
  onChange,
  models,
  listId,
}: ModelFieldProps) => {
  const hasList = models !== undefined && models.length > 0 && listId !== undefined;
  return (
    <Field
      label={label}
      helper={helper ?? (hasList ? settingsCopy.models.pickerHelper : undefined)}
    >
      {({ inputId, describedBy }) => (
        <>
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            className="font-mono text-[13px]"
            list={hasList ? listId : undefined}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          {hasList ? (
            <datalist id={listId}>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </datalist>
          ) : null}
        </>
      )}
    </Field>
  );
};

/**
 * Google Drive sign-in and storage mode. When signed out the section reads
 * exactly like a local-first app with an optional upgrade; signing in mirrors
 * the workspace to the user's own Drive. All async seams return Result, so a
 * failure lands as an inline session message, never a thrown error.
 */
const DriveSection = () => {
  const googleClientId = useSettingsStore((state) => state.googleClientId);
  const setGoogleClientId = useSettingsStore((state) => state.setGoogleClientId);
  const sessionState = useSessionStore((state) => state.session);
  const storageMode = useSessionStore((state) => state.storageMode);

  const isSigningIn = sessionState.state === "signing-in";

  const handleSignIn = () => {
    void signIn();
  };

  return (
    <section
      aria-labelledby="settings-drive"
      className="mt-6 border-t border-line pt-6"
    >
      <h2
        id="settings-drive"
        className="font-display text-lg font-bold tracking-[-0.02em]"
      >
        {settingsCopy.drive.heading}
      </h2>
      <p className="mt-1 text-[13px] text-fg-muted">{settingsCopy.drive.intro}</p>

      <div className="mt-5 flex flex-col gap-5">
        <Field
          label={settingsCopy.drive.clientIdLabel}
          helper={settingsCopy.drive.clientIdHelper}
        >
          {({ inputId, describedBy }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              type="password"
              autoComplete="off"
              placeholder={settingsCopy.drive.clientIdPlaceholder}
              value={googleClientId}
              onChange={(event) => setGoogleClientId(event.target.value)}
            />
          )}
        </Field>

        {/* Account row: stacks below 640px. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {sessionState.state === "signed-in" ? (
            <span className="inline-flex items-center gap-2 text-[13px] text-fg-secondary">
              <CloudCheck size={16} className="text-accent" aria-hidden />
              {settingsCopy.drive.signedInAs(sessionState.identity.email)}
            </span>
          ) : sessionState.state === "error" ? (
            <span role="alert" className="text-[13px] text-danger">
              {sessionState.message}
            </span>
          ) : (
            <span className="text-[13px] text-fg-muted">
              {storageMode === "drive"
                ? settingsCopy.drive.modeDriveNote
                : settingsCopy.drive.modeLocalNote}
            </span>
          )}

          {sessionState.state === "signed-in" ? (
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              {settingsCopy.drive.signOut}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              busy={isSigningIn}
              onClick={handleSignIn}
            >
              {isSigningIn
                ? settingsCopy.drive.signingIn
                : settingsCopy.drive.signIn}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};

export const SettingsPage = () => {
  const textProvider = useSettingsStore((state) => state.textProvider);
  const imageProvider = useSettingsStore((state) => state.imageProvider);
  const videoProvider = useSettingsStore((state) => state.videoProvider);
  const audioProvider = useSettingsStore((state) => state.audioProvider);
  const geminiApiKey = useSettingsStore((state) => state.geminiApiKey);
  const geminiTextModel = useSettingsStore((state) => state.geminiTextModel);
  const geminiImageModel = useSettingsStore((state) => state.geminiImageModel);
  const geminiVideoModel = useSettingsStore((state) => state.geminiVideoModel);
  const falApiKey = useSettingsStore((state) => state.falApiKey);
  const falTextModel = useSettingsStore((state) => state.falTextModel);
  const falImageModel = useSettingsStore((state) => state.falImageModel);
  const falVideoModel = useSettingsStore((state) => state.falVideoModel);
  const falAudioModel = useSettingsStore((state) => state.falAudioModel);
  const elevenLabsApiKey = useSettingsStore((state) => state.elevenLabsApiKey);
  const elevenLabsDefaultVoiceId = useSettingsStore(
    (state) => state.elevenLabsDefaultVoiceId,
  );
  const elevenLabsTtsModel = useSettingsStore((state) => state.elevenLabsTtsModel);
  const meshyApiKey = useSettingsStore((state) => state.meshyApiKey);
  const setTextProvider = useSettingsStore((state) => state.setTextProvider);
  const setImageProvider = useSettingsStore((state) => state.setImageProvider);
  const setVideoProvider = useSettingsStore((state) => state.setVideoProvider);
  const setAudioProvider = useSettingsStore((state) => state.setAudioProvider);
  const setGeminiApiKey = useSettingsStore((state) => state.setGeminiApiKey);
  const setGeminiTextModel = useSettingsStore((state) => state.setGeminiTextModel);
  const setGeminiImageModel = useSettingsStore((state) => state.setGeminiImageModel);
  const setGeminiVideoModel = useSettingsStore((state) => state.setGeminiVideoModel);
  const setFalApiKey = useSettingsStore((state) => state.setFalApiKey);
  const setFalTextModel = useSettingsStore((state) => state.setFalTextModel);
  const setFalImageModel = useSettingsStore((state) => state.setFalImageModel);
  const setFalVideoModel = useSettingsStore((state) => state.setFalVideoModel);
  const setFalAudioModel = useSettingsStore((state) => state.setFalAudioModel);
  const setElevenLabsApiKey = useSettingsStore((state) => state.setElevenLabsApiKey);
  const setElevenLabsDefaultVoiceId = useSettingsStore(
    (state) => state.setElevenLabsDefaultVoiceId,
  );
  const setElevenLabsTtsModel = useSettingsStore(
    (state) => state.setElevenLabsTtsModel,
  );
  const setMeshyApiKey = useSettingsStore((state) => state.setMeshyApiKey);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAll = () => {
    setDeleting(true);
    localStorage.clear();
    const request = indexedDB.deleteDatabase("vixio-studio");
    const finish = () => location.assign("/");
    // Open store connections block deletion until the page unloads; navigating
    // releases them and the pending delete completes on reload.
    request.onsuccess = finish;
    request.onerror = finish;
    request.onblocked = finish;
  };

  return (
    <div className="min-h-[100dvh] bg-ink-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-ink-panel">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
          <Link
            to="/"
            className="flex h-9 items-center gap-2 px-2 text-sm text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
          >
            <ArrowLeft size={16} aria-hidden />
            {settingsCopy.topBar.back}
          </Link>
          <span className="h-4 w-px bg-line" aria-hidden />
          <h1 className="font-display text-base font-bold tracking-[-0.02em]">
            {settingsCopy.heading}
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <section aria-labelledby="settings-providers">
          <h2
            id="settings-providers"
            className="font-display text-lg font-bold tracking-[-0.02em]"
          >
            {settingsCopy.providers.heading}
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            {settingsCopy.providers.intro}
          </p>
          <div className="mt-5 flex flex-col gap-4">
            <ProviderRow
              label={settingsCopy.providers.text.label}
              hint={settingsCopy.providers.text.hint}
              options={PROVIDER_OPTIONS}
              value={textProvider}
              onChange={setTextProvider}
            />
            <ProviderRow
              label={settingsCopy.providers.image.label}
              hint={settingsCopy.providers.image.hint}
              options={PROVIDER_OPTIONS}
              value={imageProvider}
              onChange={setImageProvider}
            />
            <ProviderRow
              label={settingsCopy.providers.video.label}
              hint={settingsCopy.providers.video.hint}
              options={PROVIDER_OPTIONS}
              value={videoProvider}
              onChange={setVideoProvider}
            />
            <ProviderRow
              label={settingsCopy.providers.audio.label}
              hint={settingsCopy.providers.audio.hint}
              options={AUDIO_PROVIDER_OPTIONS}
              value={audioProvider}
              onChange={setAudioProvider}
            />
          </div>
          <p className="mt-4 text-xs text-fg-muted">{settingsCopy.gemini.note}</p>
        </section>

        <section
          aria-labelledby="settings-gemini"
          className="mt-6 border-t border-line pt-6"
        >
          <h2
            id="settings-gemini"
            className="font-display text-lg font-bold tracking-[-0.02em]"
          >
            {settingsCopy.gemini.heading}
          </h2>
          <div className="mt-5 flex flex-col gap-5">
            <VerifiedKeyField
              label={settingsCopy.gemini.keyLabel}
              helper={settingsCopy.gemini.keyHelper}
              placeholder={settingsCopy.gemini.keyPlaceholder}
              value={geminiApiKey}
              onChange={setGeminiApiKey}
              inputTestId="settings-gemini-key"
              verifyTestId="verify-gemini"
              verify={verifyGeminiKey}
            />
            <ModelField
              label={settingsCopy.gemini.textModelLabel}
              value={geminiTextModel}
              onChange={setGeminiTextModel}
            />
            <ModelField
              label={settingsCopy.gemini.imageModelLabel}
              value={geminiImageModel}
              onChange={setGeminiImageModel}
              models={modelsFor("gemini", "image")}
              listId="settings-models-gemini-image"
            />
            <ModelField
              label={settingsCopy.gemini.videoModelLabel}
              value={geminiVideoModel}
              onChange={setGeminiVideoModel}
              models={modelsFor("gemini", "video")}
              listId="settings-models-gemini-video"
            />
          </div>
        </section>

        <section
          aria-labelledby="settings-fal"
          className="mt-6 border-t border-line pt-6"
        >
          <h2
            id="settings-fal"
            className="font-display text-lg font-bold tracking-[-0.02em]"
          >
            {settingsCopy.fal.heading}
          </h2>
          <div className="mt-5 flex flex-col gap-5">
            <VerifiedKeyField
              label={settingsCopy.fal.keyLabel}
              helper={settingsCopy.fal.keyHelper}
              placeholder={settingsCopy.fal.keyPlaceholder}
              value={falApiKey}
              onChange={setFalApiKey}
              inputTestId="settings-fal-key"
              verifyTestId="verify-fal"
              verify={verifyFalKey}
            />
            <ModelField
              label={settingsCopy.fal.textModelLabel}
              helper={settingsCopy.fal.textModelHelper}
              value={falTextModel}
              onChange={setFalTextModel}
            />
            <ModelField
              label={settingsCopy.fal.imageModelLabel}
              value={falImageModel}
              onChange={setFalImageModel}
              models={modelsFor("fal", "image")}
              listId="settings-models-fal-image"
            />
            <ModelField
              label={settingsCopy.fal.videoModelLabel}
              value={falVideoModel}
              onChange={setFalVideoModel}
              models={modelsFor("fal", "video")}
              listId="settings-models-fal-video"
            />
            <ModelField
              label={settingsCopy.fal.audioModelLabel}
              helper={settingsCopy.fal.audioModelHelper}
              value={falAudioModel}
              onChange={setFalAudioModel}
              models={modelsFor("fal", "audio")}
              listId="settings-models-fal-audio"
            />
          </div>
        </section>

        <section
          aria-labelledby="settings-elevenlabs"
          className="mt-6 border-t border-line pt-6"
        >
          <h2
            id="settings-elevenlabs"
            className="font-display text-lg font-bold tracking-[-0.02em]"
          >
            {settingsCopy.elevenlabs.heading}
          </h2>
          <div className="mt-5 flex flex-col gap-5">
            <VerifiedKeyField
              label={settingsCopy.elevenlabs.keyLabel}
              helper={settingsCopy.elevenlabs.keyHelper}
              placeholder={settingsCopy.elevenlabs.keyPlaceholder}
              value={elevenLabsApiKey}
              onChange={setElevenLabsApiKey}
              inputTestId="settings-elevenlabs-key"
              verifyTestId="verify-elevenlabs"
              verify={verifyElevenLabsKey}
            />
            <Field
              label={settingsCopy.elevenlabs.voiceLabel}
              helper={settingsCopy.elevenlabs.voiceHelper}
            >
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  className="font-mono text-[13px]"
                  value={elevenLabsDefaultVoiceId}
                  onChange={(event) =>
                    setElevenLabsDefaultVoiceId(event.target.value)
                  }
                />
              )}
            </Field>
            <ModelField
              label={settingsCopy.elevenlabs.ttsModelLabel}
              helper={settingsCopy.elevenlabs.ttsModelHelper}
              value={elevenLabsTtsModel}
              onChange={setElevenLabsTtsModel}
            />
          </div>
        </section>

        <section
          aria-labelledby="settings-meshy"
          className="mt-6 border-t border-line pt-6"
        >
          <h2
            id="settings-meshy"
            className="font-display text-lg font-bold tracking-[-0.02em]"
          >
            {settingsCopy.meshy.heading}
          </h2>
          <p className="mt-1 text-[13px] text-fg-muted">
            {settingsCopy.meshy.intro}
          </p>
          <div className="mt-5 flex flex-col gap-5">
            <VerifiedKeyField
              label={settingsCopy.meshy.keyLabel}
              helper={settingsCopy.meshy.keyHelper}
              placeholder={settingsCopy.meshy.keyPlaceholder}
              value={meshyApiKey}
              onChange={setMeshyApiKey}
              inputTestId="settings-meshy-key"
              verifyTestId="verify-meshy"
              verify={() => verifyMeshyKey()}
            />
            <p className="text-xs text-fg-muted">
              {settingsCopy.meshy.testKeyNote}
            </p>
          </div>
        </section>

        <DriveSection />

        <section
          aria-labelledby="settings-workspace"
          className="mt-6 border-t border-line pt-6"
        >
          <h2
            id="settings-workspace"
            className="font-display text-lg font-bold tracking-[-0.02em]"
          >
            {settingsCopy.workspace.heading}
          </h2>
          {/* Danger row: stacks below 640px, hint left and action right above it. */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-sm text-[13px] text-fg-secondary">
              {settingsCopy.workspace.deleteHint}
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash size={14} aria-hidden />
              {settingsCopy.workspace.deleteTitle}
            </Button>
          </div>
        </section>
      </main>

      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!deleting) setConfirmOpen(false);
        }}
        title={settingsCopy.workspace.dialogTitle}
      >
        <p className="text-sm leading-relaxed text-fg-secondary">
          {settingsCopy.workspace.dialogBody}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={deleting}
            onClick={() => setConfirmOpen(false)}
          >
            {settingsCopy.workspace.cancel}
          </Button>
          <Button
            variant="danger"
            size="sm"
            busy={deleting}
            onClick={handleDeleteAll}
          >
            {settingsCopy.workspace.confirm}
          </Button>
        </div>
      </Dialog>
    </div>
  );
};
