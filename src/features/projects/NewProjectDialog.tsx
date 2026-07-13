import type { FormEvent } from "react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Button,
  Dialog,
  Field,
  Segmented,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  ASPECT_RATIOS,
  COMIC_STYLES,
  DEFAULT_COMIC_STYLE_ID,
  DEFAULT_STYLE_ID,
  PROJECT_FORMATS,
  READING_DIRECTIONS,
  VISUAL_STYLES,
} from "@/domain/constants";
import type {
  AspectRatio,
  ComicStyleId,
  ProjectFormat,
  ProjectMode,
  ReadingDirection,
} from "@/domain/types";
import { useProjectsStore } from "@/stores/projects";

import { projectsCopy } from "./copy";

const ASPECT_OPTIONS: readonly { value: AspectRatio; label: string }[] =
  ASPECT_RATIOS.map((ratio) => ({ value: ratio, label: ratio }));

/** Comic projects render panels at a fixed square canvas; aspect is not user-facing. */
const COMIC_ASPECT_RATIO: AspectRatio = "1:1";

const READING_DIRECTION_OPTIONS: readonly {
  value: ReadingDirection;
  label: string;
  testId: string;
}[] = READING_DIRECTIONS.map((direction) => ({
  ...direction,
  testId: `reading-direction-${direction.value}`,
}));

/** Manga reads right to left by convention; every other comic style reads left to right. */
const defaultReadingDirectionFor = (styleId: ComicStyleId): ReadingDirection =>
  styleId === "manga-bw" ? "rtl" : "ltr";

const MODE_OPTIONS: readonly {
  value: ProjectMode;
  label: string;
  testId: string;
}[] = [
  {
    value: "film",
    label: projectsCopy.newProject.modeFilm,
    testId: "project-mode-film",
  },
  {
    value: "comic",
    label: projectsCopy.newProject.modeComic,
    testId: "project-mode-comic",
  },
];

type StylePickerProps = {
  value: string;
  onChange: (styleId: string) => void;
};

const StylePicker = ({ value, onChange }: StylePickerProps) => (
  <div
    role="radiogroup"
    aria-label={projectsCopy.newProject.styleLabel}
    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
  >
    {VISUAL_STYLES.map((style) => {
      const selected = style.id === value;
      return (
        <button
          key={style.id}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(style.id)}
          className={`flex items-start gap-3 border p-3 text-left transition-colors duration-150 ${
            selected
              ? "border-accent bg-ink-raised"
              : "border-line hover:bg-ink-hover"
          }`}
        >
          <span
            aria-hidden
            className="mt-0.5 size-6 shrink-0"
            style={{
              background: `linear-gradient(135deg, ${style.gradeFrom}, ${style.gradeTo})`,
            }}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">
              {style.name}
            </span>
            <span className="mt-0.5 block text-xs text-fg-secondary">
              {style.blurb}
            </span>
          </span>
        </button>
      );
    })}
  </div>
);

type ComicStylePickerProps = {
  value: ComicStyleId;
  onChange: (styleId: ComicStyleId) => void;
};

const ComicStylePicker = ({ value, onChange }: ComicStylePickerProps) => (
  <div
    role="radiogroup"
    aria-label={projectsCopy.newProject.comicStyleLabel}
    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
  >
    {COMIC_STYLES.map((style) => {
      const selected = style.id === value;
      return (
        <button
          key={style.id}
          type="button"
          role="radio"
          aria-checked={selected}
          data-testid={`comic-style-${style.id}`}
          onClick={() => onChange(style.id)}
          className={`flex items-start gap-3 border p-3 text-left transition-colors duration-150 ${
            selected
              ? "border-accent bg-ink-raised"
              : "border-line hover:bg-ink-hover"
          }`}
        >
          <span
            aria-hidden
            className="mt-0.5 size-6 shrink-0"
            style={{
              background: `linear-gradient(135deg, ${style.gradeFrom}, ${style.gradeTo})`,
            }}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">
              {style.label}
            </span>
            <span className="mt-0.5 block text-xs text-fg-secondary">
              {style.blurb}
            </span>
          </span>
        </button>
      );
    })}
  </div>
);

type NewProjectFormProps = {
  onClose: () => void;
};

/**
 * Lives inside the Dialog so it unmounts on close and every open starts with
 * a clean slate. Title and logline validate inline after the first submit.
 */
const NewProjectForm = ({ onClose }: NewProjectFormProps) => {
  const navigate = useNavigate();
  const createProject = useProjectsStore((state) => state.createProject);
  const updateProject = useProjectsStore((state) => state.updateProject);
  const genreListId = useId();

  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [mode, setMode] = useState<ProjectMode>("film");
  const [format, setFormat] = useState<ProjectFormat>("short-film");
  const [genre, setGenre] = useState("");
  const [styleId, setStyleId] = useState<string>(DEFAULT_STYLE_ID);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [comicStyleId, setComicStyleId] = useState<ComicStyleId>(
    DEFAULT_COMIC_STYLE_ID,
  );
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>(
    defaultReadingDirectionFor(DEFAULT_COMIC_STYLE_ID),
  );
  const [directionTouched, setDirectionTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const titleError =
    submitted && title.trim().length === 0
      ? projectsCopy.newProject.titleRequired
      : undefined;
  const loglineError =
    submitted && logline.trim().length === 0
      ? projectsCopy.newProject.loglineRequired
      : undefined;
  const selectedFormat = PROJECT_FORMATS.find(
    (candidate) => candidate.value === format,
  );
  const canSubmit = title.trim().length > 0 && logline.trim().length > 0;

  const handleComicStyleChange = (id: ComicStyleId) => {
    setComicStyleId(id);
    // Manga defaults reading direction to right to left; leave any direction
    // the user picked by hand alone.
    if (!directionTouched) setReadingDirection(defaultReadingDirectionFor(id));
  };

  const handleReadingDirectionChange = (direction: ReadingDirection) => {
    setReadingDirection(direction);
    setDirectionTouched(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (!canSubmit) return;
    const comic = mode === "comic";
    const project = createProject({
      title: title.trim(),
      logline: logline.trim(),
      mode,
      format,
      genre: genre.trim(),
      // Comic pages lay out from a fixed layout pageSize, not the film aspect
      // trio; the image style similarly comes from comicStyleId below.
      styleId: comic ? DEFAULT_STYLE_ID : styleId,
      aspectRatio: comic ? COMIC_ASPECT_RATIO : aspectRatio,
    });
    if (comic) {
      // createProject does not accept comicStyleId/readingDirection, so apply
      // the chosen values right after create.
      updateProject(project.id, { comicStyleId, readingDirection });
    }
    navigate(`/p/${project.id}/script`);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <Field
        label={projectsCopy.newProject.modeLabel}
        helper={
          mode === "comic"
            ? projectsCopy.newProject.modeHelperComic
            : projectsCopy.newProject.modeHelperFilm
        }
      >
        {() => (
          <Segmented
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
            ariaLabel={projectsCopy.newProject.modeLabel}
          />
        )}
      </Field>

      <Field label={projectsCopy.newProject.titleLabel} error={titleError}>
        {({ inputId, describedBy }) => (
          <TextInput
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={titleError ? true : undefined}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={projectsCopy.newProject.titlePlaceholder}
          />
        )}
      </Field>

      <Field
        label={projectsCopy.newProject.loglineLabel}
        helper={projectsCopy.newProject.loglineHelper}
        error={loglineError}
      >
        {({ inputId, describedBy }) => (
          <TextArea
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={loglineError ? true : undefined}
            value={logline}
            onChange={(event) => setLogline(event.target.value)}
            placeholder={projectsCopy.newProject.loglinePlaceholder}
          />
        )}
      </Field>

      <Field label={projectsCopy.newProject.genreLabel}>
        {({ inputId, describedBy }) => (
          <>
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              list={genreListId}
              value={genre}
              onChange={(event) => setGenre(event.target.value)}
              placeholder={projectsCopy.newProject.genrePlaceholder}
            />
            <datalist id={genreListId}>
              {projectsCopy.genreSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </>
        )}
      </Field>

      {mode === "comic" ? (
        <>
          <Field label={projectsCopy.newProject.comicStyleLabel}>
            {() => (
              <ComicStylePicker
                value={comicStyleId}
                onChange={handleComicStyleChange}
              />
            )}
          </Field>

          <Field label={projectsCopy.newProject.readingDirectionLabel}>
            {() => (
              <Segmented
                options={READING_DIRECTION_OPTIONS}
                value={readingDirection}
                onChange={handleReadingDirectionChange}
                ariaLabel={projectsCopy.newProject.readingDirectionLabel}
              />
            )}
          </Field>
        </>
      ) : (
        <>
          <Field
            label={projectsCopy.newProject.formatLabel}
            helper={selectedFormat?.hint}
          >
            {() => (
              <Segmented
                options={PROJECT_FORMATS}
                value={format}
                onChange={setFormat}
                ariaLabel={projectsCopy.newProject.formatLabel}
              />
            )}
          </Field>

          <Field label={projectsCopy.newProject.styleLabel}>
            {() => <StylePicker value={styleId} onChange={setStyleId} />}
          </Field>

          <Field label={projectsCopy.newProject.aspectLabel}>
            {() => (
              <Segmented
                options={ASPECT_OPTIONS}
                value={aspectRatio}
                onChange={setAspectRatio}
                ariaLabel={projectsCopy.newProject.aspectLabel}
              />
            )}
          </Field>
        </>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs text-fg-muted">
          {canSubmit ? null : projectsCopy.newProject.createHelper}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={onClose}>
            {projectsCopy.newProject.cancel}
          </Button>
          <Button variant="primary" type="submit" disabled={!canSubmit}>
            {projectsCopy.newProject.submit}
          </Button>
        </div>
      </div>
    </form>
  );
};

type NewProjectDialogProps = {
  open: boolean;
  onClose: () => void;
};

export const NewProjectDialog = ({ open, onClose }: NewProjectDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    title={projectsCopy.newProject.title}
    width="lg"
  >
    <NewProjectForm onClose={onClose} />
  </Dialog>
);
