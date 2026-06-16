import { CloudCheck, SignIn } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

import { useSessionStore } from "@/stores/session";

/**
 * The cloud account chip that rides in the top bar of both the projects home
 * and the workspace shell. Signed in: the account email plus a live sync dot
 * while a Drive write is in flight. Signed out: a quiet "Sign in" link to
 * settings. Token classes only, one accent value, radius 0 except the lone
 * permitted live-status dot.
 */

const chipCopy = {
  signIn: "Sign in",
  syncing: "Syncing",
} as const;

export const AccountChip = () => {
  const session = useSessionStore((state) => state.session);
  const syncStatus = useSessionStore((state) => state.syncStatus);

  if (session.state !== "signed-in") {
    return (
      <Link
        to="/settings"
        className="flex h-9 items-center gap-2 px-3 text-sm text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
      >
        <SignIn size={16} aria-hidden />
        {chipCopy.signIn}
      </Link>
    );
  }

  const email = session.identity.email;
  const label = email.length > 0 ? email : session.identity.name;
  const isSyncing = syncStatus.state === "syncing";

  return (
    <Link
      to="/settings"
      aria-label={label.length > 0 ? `Signed in as ${label}` : "Account"}
      className="flex h-9 max-w-[220px] items-center gap-2 px-3 text-sm text-fg-secondary transition-colors duration-150 hover:bg-ink-hover hover:text-fg"
    >
      {isSyncing ? (
        <span
          className="size-2 shrink-0 animate-pulse rounded-full bg-accent-media"
          aria-label={chipCopy.syncing}
        />
      ) : (
        <CloudCheck size={16} className="shrink-0 text-accent" aria-hidden />
      )}
      <span className="truncate font-mono text-xs">{label}</span>
    </Link>
  );
};
