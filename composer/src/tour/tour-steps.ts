import type { DriveStep } from "driver.js";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { MOD_KEY } from "@/utils/platform";

// -- Types --------------------------------------------------------------------

interface GatedStep {
  stepIndex: number;
  task: string;
  gateCheck: () => boolean;
  tabId: string;
}

// -- Helpers ------------------------------------------------------------------

function switchTab(tabId: string) {
  useProjectStore.getState().setActiveTab(tabId as "import" | "edit" | "sync" | "timeline" | "preview" | "export");
}

const YOUTUBE_EMBED_HTML = `<div class="composer-tour-video-embed"><iframe src="https://www.youtube.com/embed/IEA0W4qpRIs?rel=0" title="Composer demo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" allowfullscreen></iframe></div>`;

// -- Gate checks --------------------------------------------------------------

const gateAudioLoaded = () => useAudioStore.getState().source !== null;
const gateLyricsExist = () => useProjectStore.getState().lines.length > 0;
const gateFirstLineSynced = () => {
  const lines = useProjectStore.getState().lines;
  return lines.length > 0 && lines[0]?.begin !== undefined;
};

// -- Tour Steps ---------------------------------------------------------------

function createTourSteps(): DriveStep[] {
  return [
    // 0: Welcome
    {
      popover: {
        title: "Welcome to Composer",
        description:
          "A tool for creating synchronized lyrics in TTML format. Let's walk through the workflow together.",
        popoverClass: "composer-tour composer-tour-modal",
        showButtons: ["next", "close"],
        showProgress: false,
      },
    },
    // 1: Import tab
    {
      element: () => document.querySelector('[data-tour="import-dropzone"]') as Element,
      popover: {
        title: "Bring in your audio",
        description:
          "Drop an audio file (MP3, WAV, M4A, OGG, FLAC) onto this area, or paste a YouTube URL below to pull the audio straight from a video.",
        side: "bottom",
        align: "center",
      },
      onHighlightStarted: () => switchTab("import"),
    },
    // 2: GATED - wait for audio
    {
      element: () => document.querySelector('[data-tour="import-dropzone"]') as Element,
      popover: {
        title: "Import your audio",
        description: "Drop an audio file or paste a YouTube URL to continue.",
        showButtons: [],
      },
      onHighlightStarted: () => switchTab("import"),
    },
    // 3: Edit tab
    {
      element: () => document.querySelector('[data-tour="edit-panel"]') as Element,
      popover: {
        title: "Type or paste lyrics",
        description: "Enter your lyrics in the text area on the left. Each line becomes a sync target.",
        side: "right",
        align: "start",
      },
      onHighlightStarted: () => switchTab("edit"),
    },
    // 4: GATED - wait for lyrics
    {
      element: () => document.querySelector('[data-tour="edit-panel"]') as Element,
      popover: {
        title: "Add your lyrics",
        description: "Type or paste at least one line to continue.",
        showButtons: [],
      },
      onHighlightStarted: () => switchTab("edit"),
    },
    // 5: Sync tab
    {
      element: () => document.querySelector('[data-tour="sync-panel"]') as Element,
      popover: {
        title: "Sync your lyrics",
        description:
          "Press Start, then tap Space in time with each line or word. Use the granularity toggle for line vs word precision.",
        side: "left",
        align: "start",
      },
      onHighlightStarted: () => switchTab("sync"),
    },
    // 6: GATED - wait for first line synced
    {
      element: () => document.querySelector('[data-tour="sync-panel"]') as Element,
      popover: {
        title: "Sync at least one line",
        description: "Press Start, play the audio, then tap Space to set timing.",
        showButtons: [],
      },
      onHighlightStarted: () => switchTab("sync"),
    },
    // 7: Timeline tab
    {
      element: () => document.querySelector('[data-tour="timeline-panel"]') as Element,
      popover: {
        title: "Fine-tune on the timeline",
        description: `Drag words to adjust timing, or select words and nudge them with the arrow keys. ${MOD_KEY} + scroll to zoom, F to toggle playhead follow. Group repeating sections with ${MOD_KEY}+G, then duplicate them as linked instances with ${MOD_KEY}+D so edits propagate everywhere.`,
        side: "top",
        align: "center",
      },
      onHighlightStarted: () => switchTab("timeline"),
    },
    // 8: Preview tab
    {
      element: () => document.querySelector('[data-tour="preview-panel"]') as Element,
      popover: {
        title: "Preview your work",
        description: "Watch lyrics play back in sync with the audio. Click any line to jump there.",
        side: "left",
        align: "start",
      },
      onHighlightStarted: () => switchTab("preview"),
    },
    // 9: Export tab
    {
      element: () => document.querySelector('[data-tour="export-panel"]') as Element,
      popover: {
        title: "Export your TTML",
        description: "Copy or download the finished TTML file. You can also export the full project as JSON.",
        side: "left",
        align: "start",
      },
      onHighlightStarted: () => switchTab("export"),
    },
    // 10: Outro with video
    {
      popover: {
        title: "See a full walkthrough",
        description: `You're all set! Here's a video of the full process.${YOUTUBE_EMBED_HTML}`,
        popoverClass: "composer-tour composer-tour-video",
        showButtons: ["previous", "close"],
        doneBtnText: "Done",
        showProgress: false,
      },
    },
  ];
}

// -- Gated Steps Config -------------------------------------------------------

const TOUR_GATED_STEPS: GatedStep[] = [
  {
    stepIndex: 2,
    task: "Drop an audio file",
    gateCheck: gateAudioLoaded,
    tabId: "import",
  },
  {
    stepIndex: 4,
    task: "Type or paste lyrics",
    gateCheck: gateLyricsExist,
    tabId: "edit",
  },
  {
    stepIndex: 6,
    task: "Sync at least one line",
    gateCheck: gateFirstLineSynced,
    tabId: "sync",
  },
];

// -- Exports ------------------------------------------------------------------

export { createTourSteps, TOUR_GATED_STEPS };
export type { GatedStep };
