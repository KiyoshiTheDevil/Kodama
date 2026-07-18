// Profile switcher modal — pick an account or add a new one. Extracted from App.jsx.
import {
  cn,
  Button,
  ModalRoot,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalIcon,
  ModalHeading,
  ModalBody,
  ModalFooter,
  ModalCloseTrigger,
} from "@heroui/react";
import { Users, Check, UserPlus } from "../icons.jsx";
import { thumb, useLang } from "../context.jsx";
import { useProfileState, useProfileActions } from "../features/profiles/profile-context.jsx";

export function ProfileSwitcherModal({ isOpen, onOpenChange }) {
  const t = useLang();
  // Account list/actions come from ProfileContext (Step 12) rather than props.
  const { profiles: list } = useProfileState();
  const { switchProfile: onSwitch, addProfile: onAdd } = useProfileActions();

  const Avatar = ({ a }) => (
    <div
      className={cn(
        "w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-semibold text-t12",
        a.type === "local"
          ? "bg-elevated text-secondary border border-border"
          : "bg-accent text-white"
      )}
    >
      {a.avatar ? (
        <img src={thumb(a.avatar)} alt="" className="w-full h-full object-cover" />
      ) : (
        (a.displayName || a.name || "?")[0].toUpperCase()
      )}
    </div>
  );

  return (
    <ModalRoot isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="sm" className="w-[380px] max-w-[92vw]">
          <ModalDialog className="overflow-x-hidden">
            <ModalHeader>
              <ModalIcon>
                <Users size={18} />
              </ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("switchProfileTitle")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-1">
                {list.map((a) => (
                  <button
                    key={a.name}
                    onClick={() => {
                      if (!a.active) onSwitch(a.name);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-xl text-left transition-colors duration-150 border-none bg-transparent w-full",
                      a.active ? "bg-accent-dim" : "hover:bg-hover"
                    )}
                  >
                    <Avatar a={a} />
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn("text-t13 font-medium truncate", a.active && "text-accent")}
                      >
                        {a.displayName || a.name}
                      </div>
                      <div className="text-t11 text-muted truncate">
                        {a.type === "local"
                          ? t("localAccount")
                          : a.loggedOut
                            ? t("logOut")
                            : a.handle}
                      </div>
                    </div>
                    {a.active && <Check size={16} className="text-accent shrink-0" />}
                  </button>
                ))}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="ghost"
                fullWidth
                className="justify-start gap-2.5 px-3 rounded-xl text-secondary"
                onPress={() => {
                  onOpenChange(false);
                  onAdd();
                }}
              >
                <UserPlus size={16} />
                {t("addAccount")}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}
