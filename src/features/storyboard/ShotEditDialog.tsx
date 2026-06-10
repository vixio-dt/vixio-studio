import { useState } from "react";

import { Button, Dialog, Field, Select, TextArea, TextInput } from "@/components/ui";
import {
  CAMERA_ANGLES,
  CAMERA_MOVEMENTS,
  LENSES,
  LIGHTING_CHOICES,
  SHOT_SIZES,
} from "@/domain/constants";
import type {
  CameraAngle,
  CameraMovement,
  Character,
  LensChoice,
  LightingChoice,
  Shot,
  ShotSize,
} from "@/domain/types";
import type { CharacterId } from "@/lib/id";
import { useProjectsStore } from "@/stores/projects";

import { durationOptions } from "./boardLogic";
import { storyboardCopy } from "./copy";

type ShotEditDialogProps = {
  shot: Shot;
  sceneCharacters: readonly Character[];
  onClose: () => void;
};

const OptionSelect = <TValue extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: TValue;
  options: readonly { value: TValue; label: string }[];
  onChange: (value: TValue) => void;
}) => (
  <Field label={label}>
    {({ inputId }) => (
      <Select
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    )}
  </Field>
);

/** Edits one shot's direction, camera vocabulary, timing, and cast. */
export const ShotEditDialog = ({
  shot,
  sceneCharacters,
  onClose,
}: ShotEditDialogProps) => {
  const updateShot = useProjectsStore((state) => state.updateShot);
  const copy = storyboardCopy.editDialog;

  const [description, setDescription] = useState(shot.description);
  const [dialogue, setDialogue] = useState(shot.dialogue ?? "");
  const [size, setSize] = useState<ShotSize>(shot.size);
  const [angle, setAngle] = useState<CameraAngle>(shot.angle);
  const [movement, setMovement] = useState<CameraMovement>(shot.movement);
  const [lens, setLens] = useState<LensChoice>(shot.lens);
  const [lighting, setLighting] = useState<LightingChoice>(shot.lighting);
  const [duration, setDuration] = useState(shot.durationSeconds);
  const [characterIds, setCharacterIds] = useState<CharacterId[]>(
    shot.characterIds,
  );

  const toggleCharacter = (id: CharacterId) => {
    setCharacterIds((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  };

  const handleSave = () => {
    const trimmedDialogue = dialogue.trim();
    updateShot(shot.id, {
      description: description.trim(),
      dialogue: trimmedDialogue.length > 0 ? trimmedDialogue : null,
      size,
      angle,
      movement,
      lens,
      lighting,
      durationSeconds: duration,
      characterIds,
    });
    onClose();
  };

  return (
    <Dialog open onClose={onClose} title={copy.title} width="lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        <Field label={copy.description}>
          {({ inputId }) => (
            <TextArea
              id={inputId}
              value={description}
              placeholder={copy.descriptionPlaceholder}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>

        <Field label={copy.dialogue} helper={copy.dialogueHelper}>
          {({ inputId, describedBy }) => (
            <TextInput
              id={inputId}
              aria-describedby={describedBy}
              value={dialogue}
              onChange={(event) => setDialogue(event.target.value)}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <OptionSelect
            label={copy.size}
            value={size}
            options={SHOT_SIZES}
            onChange={setSize}
          />
          <OptionSelect
            label={copy.angle}
            value={angle}
            options={CAMERA_ANGLES}
            onChange={setAngle}
          />
          <OptionSelect
            label={copy.movement}
            value={movement}
            options={CAMERA_MOVEMENTS}
            onChange={setMovement}
          />
          <OptionSelect
            label={copy.lens}
            value={lens}
            options={LENSES}
            onChange={setLens}
          />
          <OptionSelect
            label={copy.lighting}
            value={lighting}
            options={LIGHTING_CHOICES}
            onChange={setLighting}
          />
          <Field label={copy.duration}>
            {({ inputId }) => (
              <Select
                id={inputId}
                className="font-mono"
                value={String(duration)}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                {durationOptions(shot.durationSeconds).map((seconds) => (
                  <option key={seconds} value={String(seconds)}>
                    {seconds}s
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-fg-secondary">
            {copy.characters}
          </p>
          {sceneCharacters.length === 0 ? (
            <p className="text-xs text-fg-muted">{copy.noCharacters}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {sceneCharacters.map((character) => {
                const selected = characterIds.includes(character.id);
                return (
                  <button
                    key={character.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleCharacter(character.id)}
                    className={`inline-flex h-7 items-center border px-2 text-xs transition-colors duration-150 ${
                      selected
                        ? "border-accent-media/60 text-accent"
                        : "border-line-strong text-fg-muted hover:text-fg-secondary"
                    }`}
                  >
                    {character.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button size="sm" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button size="sm" variant="primary" type="submit">
            {copy.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
