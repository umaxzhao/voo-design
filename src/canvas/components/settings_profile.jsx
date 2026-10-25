import { useState } from "react";
import { useI18n } from "../use_i18n.js";
import { useUserStore } from "../store/user_store.js";
import { avatarUrl, loadIdentity, saveIdentity } from "../collab/identity.js";
import { initialsFor } from "../collab/presence.js";
import SettingsSection, { SETTINGS_INPUT_CLASS, SettingsField } from "./settings_section.jsx";

/** Display name, avatar and (for guests) the editable nickname. */
export default function ProfileSection() {
  const { t } = useI18n();
  const user = useUserStore((s) => s.user);
  const isLoggedIn = Boolean(user?.isLoggedIn);
  const [identity, setIdentity] = useState(loadIdentity);
  const [broken, setBroken] = useState(false);

  const updateGuestIdentity = (patch) => {
    setIdentity((curr) => {
      const next = { ...curr, ...patch };
      saveIdentity(next);
      return next;
    });
  };

  const displayName = isLoggedIn
    ? user?.name || user?.email || t("collab.anonymous")
    : identity.name || t("collab.anonymous");

  const currentAvatar = identity.avatarSeed ? avatarUrl(identity.avatarSeed) : null;

  return (
    <SettingsSection
      testId="settings-profile-section"
      title={t("settings.profile")}
      hint={t("settings.profileHint")}
    >
      <div className="flex items-center gap-3">
        <div
          data-testid="profile-avatar"
          className="relative flex h-10 w-10 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-xs font-medium text-neutral-100"
        >
          {initialsFor(displayName)}
          {currentAvatar && !broken ? (
            <img
              src={currentAvatar}
              alt=""
              draggable={false}
              onError={() => setBroken(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-medium text-neutral-200">{displayName}</span>
          <span className="text-xs text-neutral-400">
            {isLoggedIn ? user?.email : t("collab.guestBadge")}
          </span>
        </div>
      </div>

      {!isLoggedIn && (
        <SettingsField label={t("collab.nameField")}>
          <input
            type="text"
            value={identity.name || ""}
            onChange={(e) => updateGuestIdentity({ name: e.target.value })}
            placeholder={t("collab.namePlaceholder")}
            className={SETTINGS_INPUT_CLASS}
          />
        </SettingsField>
      )}
    </SettingsSection>
  );
}
