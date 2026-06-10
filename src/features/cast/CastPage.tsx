import { Plus, UsersThree } from "@phosphor-icons/react";
import { useMemo } from "react";

import { Button, EmptyState } from "@/components/ui";
import { useActiveProject } from "@/features/shared/useActiveProject";
import {
  selectCharactersForProject,
  useProjectsStore,
} from "@/stores/projects";

import { CharacterCard } from "./CharacterCard";
import { castCopy } from "./copy";

/**
 * The cast room: every character in the project as an editable card with a
 * portrait, identity fields that feed prompt composition, and seeded
 * portrait generation through the shared task queue.
 */
export const CastPage = () => {
  const project = useActiveProject();
  const charactersById = useProjectsStore((state) => state.characters);
  const addCharacter = useProjectsStore((state) => state.addCharacter);

  const characters = useMemo(
    () =>
      project ? selectCharactersForProject(charactersById, project.id) : [],
    [charactersById, project],
  );

  // The shell guards missing projects; this covers deletion races only.
  if (!project) return null;

  const handleAdd = () => {
    addCharacter({
      projectId: project.id,
      name: "",
      role: "supporting",
      bio: "",
      appearance: "",
      wardrobe: "",
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-4 p-4">
        <header className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">
            <span className="font-mono text-fg-secondary">
              {characters.length}
            </span>{" "}
            {characters.length === 1 ? castCopy.countOne : castCopy.countMany}
          </p>
          <Button variant="ghost" size="sm" onClick={handleAdd}>
            <Plus size={14} aria-hidden />
            {castCopy.addCharacter}
          </Button>
        </header>

        {characters.length === 0 ? (
          <EmptyState
            icon={UsersThree}
            title={castCopy.emptyTitle}
            hint={castCopy.emptyHint}
            action={
              <Button variant="outline" size="sm" onClick={handleAdd}>
                <Plus size={14} aria-hidden />
                {castCopy.addCharacter}
              </Button>
            }
          />
        ) : (
          /* Collapses to one column below 768px, then 2, 3, 4 columns up. */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {characters.map((character) => (
              <CharacterCard
                key={character.id}
                project={project}
                character={character}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
