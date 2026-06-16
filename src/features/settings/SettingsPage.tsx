import { ArrowLeft, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Button, Dialog, Field, Segmented, TextInput } from "@/components/ui";
import type { ProviderChoice } from "@/stores/settings";
import { useSettingsStore } from "@/stores/settings";

import { settingsCopy } from "./copy";

/**
 * Settings: a quiet full page outside the workspace shell. Three sections
 * separated by hairlines: provider routing, Gemini configuration, and the
 * local data danger row. Everything binds straight to the settings store,
 * which persists synchronously to localStorage.
 */

const PROVIDER_OPTIONS = [
  { value: "vixio-preview", label: settingsCopy.providers.preview },
  { value: "gemini", label: settingsCopy.providers.gemini },
  { value: "fal", label: settingsCopy.providers.fal },
] as const satisfies readonly { value: ProviderChoice; label: string }[];

type ProviderRowProps = {
  label: string;
  hint: string;
  value: ProviderChoice;
  onChange: (value: ProviderChoice) => void;
};

/** One generation kind: label and hint left, segmented choice right. Stacks below 640px. */
const ProviderRow = ({ label, hint, value, onChange }: ProviderRowProps) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] font-medium text-fg-secondary">{label}</span>
      <span className="text-xs text-fg-muted">{hint}</span>
    </div>
    <Segmented
      options={PROVIDER_OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel={label}
      size="sm"
    />
  </div>
);

export const SettingsPage = () => {
  const textProvider = useSettingsStore((state) => state.textProvider);
  const imageProvider = useSettingsStore((state) => state.imageProvider);
  const videoProvider = useSettingsStore((state) => state.videoProvider);
  const geminiApiKey = useSettingsStore((state) => state.geminiApiKey);
  const geminiTextModel = useSettingsStore((state) => state.geminiTextModel);
  const geminiImageModel = useSettingsStore((state) => state.geminiImageModel);
  const geminiVideoModel = useSettingsStore((state) => state.geminiVideoModel);
  const falApiKey = useSettingsStore((state) => state.falApiKey);
  const falTextModel = useSettingsStore((state) => state.falTextModel);
  const falImageModel = useSettingsStore((state) => state.falImageModel);
  const falVideoModel = useSettingsStore((state) => state.falVideoModel);
  const setTextProvider = useSettingsStore((state) => state.setTextProvider);
  const setImageProvider = useSettingsStore((state) => state.setImageProvider);
  const setVideoProvider = useSettingsStore((state) => state.setVideoProvider);
  const setGeminiApiKey = useSettingsStore((state) => state.setGeminiApiKey);
  const setGeminiTextModel = useSettingsStore((state) => state.setGeminiTextModel);
  const setGeminiImageModel = useSettingsStore((state) => state.setGeminiImageModel);
  const setGeminiVideoModel = useSettingsStore((state) => state.setGeminiVideoModel);
  const setFalApiKey = useSettingsStore((state) => state.setFalApiKey);
  const setFalTextModel = useSettingsStore((state) => state.setFalTextModel);
  const setFalImageModel = useSettingsStore((state) => state.setFalImageModel);
  const setFalVideoModel = useSettingsStore((state) => state.setFalVideoModel);

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
              value={textProvider}
              onChange={setTextProvider}
            />
            <ProviderRow
              label={settingsCopy.providers.image.label}
              hint={settingsCopy.providers.image.hint}
              value={imageProvider}
              onChange={setImageProvider}
            />
            <ProviderRow
              label={settingsCopy.providers.video.label}
              hint={settingsCopy.providers.video.hint}
              value={videoProvider}
              onChange={setVideoProvider}
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
            <Field
              label={settingsCopy.gemini.keyLabel}
              helper={settingsCopy.gemini.keyHelper}
            >
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="off"
                  placeholder={settingsCopy.gemini.keyPlaceholder}
                  value={geminiApiKey}
                  onChange={(event) => setGeminiApiKey(event.target.value)}
                />
              )}
            </Field>
            <Field label={settingsCopy.gemini.textModelLabel}>
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  className="font-mono text-[13px]"
                  value={geminiTextModel}
                  onChange={(event) => setGeminiTextModel(event.target.value)}
                />
              )}
            </Field>
            <Field label={settingsCopy.gemini.imageModelLabel}>
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  className="font-mono text-[13px]"
                  value={geminiImageModel}
                  onChange={(event) => setGeminiImageModel(event.target.value)}
                />
              )}
            </Field>
            <Field label={settingsCopy.gemini.videoModelLabel}>
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  className="font-mono text-[13px]"
                  value={geminiVideoModel}
                  onChange={(event) => setGeminiVideoModel(event.target.value)}
                />
              )}
            </Field>
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
            <Field
              label={settingsCopy.fal.keyLabel}
              helper={settingsCopy.fal.keyHelper}
            >
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="off"
                  placeholder={settingsCopy.fal.keyPlaceholder}
                  value={falApiKey}
                  onChange={(event) => setFalApiKey(event.target.value)}
                />
              )}
            </Field>
            <Field
              label={settingsCopy.fal.textModelLabel}
              helper={settingsCopy.fal.textModelHelper}
            >
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  className="font-mono text-[13px]"
                  value={falTextModel}
                  onChange={(event) => setFalTextModel(event.target.value)}
                />
              )}
            </Field>
            <Field
              label={settingsCopy.fal.imageModelLabel}
              helper={settingsCopy.fal.imageModelHelper}
            >
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  className="font-mono text-[13px]"
                  value={falImageModel}
                  onChange={(event) => setFalImageModel(event.target.value)}
                />
              )}
            </Field>
            <Field
              label={settingsCopy.fal.videoModelLabel}
              helper={settingsCopy.fal.videoModelHelper}
            >
              {({ inputId, describedBy }) => (
                <TextInput
                  id={inputId}
                  aria-describedby={describedBy}
                  className="font-mono text-[13px]"
                  value={falVideoModel}
                  onChange={(event) => setFalVideoModel(event.target.value)}
                />
              )}
            </Field>
          </div>
        </section>

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
