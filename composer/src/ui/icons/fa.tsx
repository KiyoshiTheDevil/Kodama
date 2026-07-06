// FontAwesome (Pro 6.7.2) icon wrappers — drop-in replacement for @/ui/icons/fa,
// matching the main Kodama app's icon set. Same component names as the Tabler icons that
// were used, so only the import source changes at call sites.
//
// FA is loaded globally via <link href="/css/all.min.css"> in index.html. Icons are the
// webfont <i class="fa-…"> form; the glyph size comes from font-size (the `size` prop) —
// call sites that size via Tailwind `size-*` classes are handled by rules in index.css.
import type React from "react";

export type IconProps = React.HTMLAttributes<HTMLElement> & {
  size?: number | string;
  // Tabler-only props — accepted so existing call sites keep compiling, then dropped.
  stroke?: number;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
  color?: string;
};

// Loose "any icon component" type — used where a component accepts an icon as a prop.
// Kept minimal so BOTH these FA wrappers and Tabler icons (in tests) satisfy it.
export type Icon = React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties; stroke?: number }>;

function fa(name: string, variant: "regular" | "solid" | "brands" = "regular"): React.FC<IconProps> {
  const family = variant === "brands" ? "fa-brands" : variant === "solid" ? "fa-solid" : "fa-regular";
  return function FaIcon(props: IconProps) {
    const { size, className, style, color, stroke, strokeWidth, absoluteStrokeWidth, ...domProps } = props;
    void stroke;
    void strokeWidth;
    void absoluteStrokeWidth;
    return (
      <i
        className={`${family} fa-${name}${className ? ` ${className}` : ""}`}
        style={{
          fontSize: size === undefined ? undefined : typeof size === "number" ? `${size}px` : size,
          color,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          ...style,
        }}
        aria-hidden={props["aria-label"] ? undefined : true}
        {...domProps}
      />
    );
  };
}

export const IconAdjustmentsHorizontal = fa("sliders");
export const IconAlbum = fa("compact-disc");
export const IconAlertTriangle = fa("triangle-exclamation");
export const IconArrowBarBoth = fa("arrows-left-right-to-line", "solid");
export const IconArrowLeft = fa("arrow-left", "solid");
export const IconArrowRight = fa("arrow-right", "solid");
export const IconArrowUpRight = fa("arrow-up-right", "solid");
export const IconArrowsMoveHorizontal = fa("arrows-left-right", "solid");
export const IconAward = fa("award");
export const IconBolt = fa("bolt");
export const IconBracketsContainEnd = fa("bracket-square-right", "solid");
export const IconBracketsContainStart = fa("bracket-square", "solid");
export const IconBrandApple = fa("apple", "brands");
export const IconBrandSpotify = fa("spotify", "brands");
export const IconBrandYoutube = fa("youtube", "brands");
export const IconBug = fa("bug");
export const IconBulb = fa("lightbulb");
export const IconCheck = fa("check", "solid");
export const IconChevronDown = fa("chevron-down", "solid");
export const IconChevronLeft = fa("chevron-left", "solid");
export const IconChevronRight = fa("chevron-right", "solid");
export const IconChevronsDown = fa("angles-down", "solid");
export const IconChevronsUp = fa("angles-up", "solid");
export const IconClass = fa("shapes");
export const IconClipboardText = fa("clipboard");
export const IconClock = fa("clock");
export const IconCommand = fa("keyboard");
export const IconCopy = fa("copy");
export const IconDeviceFloppy = fa("floppy-disk");
export const IconDiscOff = fa("ban", "solid");
export const IconDownload = fa("download", "solid");
export const IconEdit = fa("pen-to-square");
export const IconExclamationCircle = fa("circle-exclamation");
export const IconExternalLink = fa("up-right-from-square", "solid");
export const IconEye = fa("eye");
export const IconFile = fa("file");
export const IconFileCheck = fa("file-circle-check", "solid");
export const IconFileExport = fa("file-export", "solid");
export const IconFileImport = fa("file-import", "solid");
export const IconFileMusic = fa("file-audio");
export const IconFileText = fa("file-lines");
export const IconFocusCentered = fa("crosshairs", "solid");
export const IconFolderOpen = fa("folder-open");
export const IconGhost2 = fa("ghost");
export const IconHandClick = fa("hand-pointer");
export const IconHandStop = fa("hand");
export const IconHelp = fa("circle-question");
export const IconHistory = fa("clock-rotate-left", "solid");
export const IconHome2 = fa("house", "solid");
export const IconInfoHexagon = fa("circle-info");
export const IconKeyboard = fa("keyboard");
export const IconLanguage = fa("language", "solid");
export const IconLayoutDistributeHorizontal = fa("table-columns", "solid");
export const IconLayoutRows = fa("table-list", "solid");
export const IconLifebuoy = fa("life-ring");
export const IconLink = fa("link", "solid");
export const IconListTree = fa("list-tree", "solid");
export const IconLiveView = fa("tower-broadcast", "solid");
export const IconLoader2 = fa("spinner", "solid");
export const IconLock = fa("lock", "solid");
export const IconLockOpen = fa("lock-open", "solid");
export const IconMagnet = fa("magnet", "solid");
export const IconMicrophone = fa("microphone", "solid");
export const IconMicrophone2 = fa("microphone-lines", "solid");
export const IconMinus = fa("minus", "solid");
export const IconMoodCheck = fa("face-smile");
export const IconMoodHappy = fa("face-grin");
export const IconMoodSadDizzy = fa("face-dizzy");
export const IconMusic = fa("music", "solid");
export const IconMusicExclamation = fa("music", "solid");
export const IconPencil = fa("pencil", "solid");
export const IconPlayerPauseFilled = fa("pause", "solid");
export const IconPlayerPlay = fa("play");
export const IconPlayerPlayFilled = fa("play", "solid");
export const IconPlugConnected = fa("plug", "solid");
export const IconPlus = fa("plus", "solid");
export const IconRefresh = fa("arrows-rotate", "solid");
export const IconRocket = fa("rocket");
export const IconRoute = fa("route", "solid");
export const IconScissors = fa("scissors", "solid");
export const IconSearch = fa("magnifying-glass", "solid");
export const IconSettings = fa("gear", "solid");
export const IconSquare = fa("square");
export const IconStar = fa("star");
export const IconTextPlus = fa("square-plus");
export const IconTrash = fa("trash-can");
export const IconUpload = fa("upload", "solid");
export const IconUser = fa("user");
export const IconUsers = fa("users", "solid");
export const IconVolume = fa("volume-high", "solid");
export const IconVolume2 = fa("volume-low", "solid");
export const IconVolume3 = fa("volume-xmark", "solid");
export const IconWaveSine = fa("wave-sine", "solid");
export const IconWindmill = fa("fan", "solid");
export const IconWriting = fa("pen-nib", "solid");
export const IconX = fa("xmark", "solid");
