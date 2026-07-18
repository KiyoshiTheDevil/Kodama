/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react";

// Profile context (Step 12): distributes the single useProfiles() controller (still owned and
// instantiated by App, same pattern as PlayerProvider/usePlayerController) to the Sidebar, the
// settings account tab, and the profile-switcher modal — the three consumers that previously took
// the profile list/active profile/account actions as prop-drilled App callbacks. Startup/auth gate
// state (showLogin, showLangPicker, reauthName, ...) stays App-owned; it's app-shell startup flow,
// not something these shared-UI consumers need.
const ProfileStateContext = createContext(null);
const ProfileActionsContext = createContext(null);

function useRequired(context, name) {
  const value = useContext(context);
  if (!value) throw new Error(`${name} must be used within a ProfileProvider`);
  return value;
}

export function ProfileProvider({ controller, children }) {
  const {
    profiles,
    hasProfile,
    currentProfile,
    fetchProfiles,
    handleAccountSwitch,
    handleAccountAdd,
    handleAccountReauth,
    handleAccountRemove,
    handleAccountRename,
    handleAccountAvatarChange,
    handleAccountLogout,
  } = controller;

  const state = useMemo(() => {
    const activeProfile = profiles.find((p) => p.active) || null;
    return { profiles, activeProfile, hasProfile, currentProfile };
  }, [profiles, hasProfile, currentProfile]);

  const actions = useMemo(
    () => ({
      fetchProfiles,
      switchProfile: handleAccountSwitch,
      addProfile: handleAccountAdd,
      reauthProfile: handleAccountReauth,
      removeProfile: handleAccountRemove,
      renameProfile: handleAccountRename,
      changeAvatar: handleAccountAvatarChange,
      logout: handleAccountLogout,
    }),
    [
      fetchProfiles,
      handleAccountSwitch,
      handleAccountAdd,
      handleAccountReauth,
      handleAccountRemove,
      handleAccountRename,
      handleAccountAvatarChange,
      handleAccountLogout,
    ]
  );

  return (
    <ProfileStateContext.Provider value={state}>
      <ProfileActionsContext.Provider value={actions}>{children}</ProfileActionsContext.Provider>
    </ProfileStateContext.Provider>
  );
}

export const useProfileState = () => useRequired(ProfileStateContext, "useProfileState");
export const useProfileActions = () => useRequired(ProfileActionsContext, "useProfileActions");
