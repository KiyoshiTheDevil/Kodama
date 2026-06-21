import { AudioEngine } from "@/audio/audio-engine";
import { AudioPlayer } from "@/audio/audio-player";
import { useAutoSeparate } from "@/hooks/useAutoSeparate";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useImportFromHash } from "@/hooks/useImportFromHash";
import { useImportFromQuery } from "@/hooks/useImportFromQuery";
import { useImportFromYouTube } from "@/hooks/useImportFromYouTube";
import { usePanicRecovery } from "@/hooks/usePanicRecovery";
import { usePersistence } from "@/hooks/usePersistence";
import { useResolveYouTubeTunnel } from "@/hooks/useResolveYouTubeTunnel";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useUIStore } from "@/stores/ui";
import { GuideCard } from "@/tour/guide-card";
import { useTour } from "@/tour/use-tour";
import "@/tour/tour-theme.css";
import { AppHeader } from "@/ui/app-header";
import { ConfirmModalHost } from "@/ui/confirm-modal";
import { DivergenceModalHost } from "@/ui/divergence-modal";
import { LyricsImportModalHost } from "@/views/lyrics-import-modal/lyrics-import-modal-host";
import { HelpModal } from "@/ui/help-modal";
import { SettingsModal } from "@/ui/settings-modal";
import { EditPanel } from "@/views/edit";
import { ExportPanel } from "@/views/export";
import { ImportPanel } from "@/views/import";
import { PreviewPanel } from "@/views/preview";
import { SyncPanel } from "@/views/sync/sync-panel";
import { TimelinePanel } from "@/views/timeline/timeline-panel";
import { LazyMotion, domAnimation } from "motion/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Activity, useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";

const TABS_WITH_PLAYER = ["import", "edit", "sync", "timeline", "preview"];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

const AppContent: React.FC = () => {
  const activeTab = useProjectStore((s) => s.activeTab);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const source = useAudioStore((s) => s.source);
  const [helpOpen, setHelpOpen] = useState(false);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const openSettings = useUIStore((s) => s.openSettings);
  const closeSettings = useUIStore((s) => s.closeSettings);
  const { startTour, resumeOrStartTour, shouldShowTour, guideCard, skipGuideCard } = useTour();
  const startTourRef = useRef(startTour);
  startTourRef.current = startTour;

  const showPlayer = source && TABS_WITH_PLAYER.includes(activeTab);

  // Auto-start quick tour on first visit
  useEffect(() => {
    if (!shouldShowTour) return;
    const timer = setTimeout(() => startTourRef.current(), 500);
    return () => clearTimeout(timer);
  }, [shouldShowTour]);

  usePersistence();
  useImportFromHash();
  useResolveYouTubeTunnel();
  useImportFromQuery();
  useImportFromYouTube();
  usePanicRecovery();
  useAutoSeparate();
  useDocumentTitle();

  const setHelpOpenCb = useCallback((open: boolean) => setHelpOpen(open), []);
  const setSettingsOpenCb = useCallback(
    (open: boolean) => (open ? openSettings() : closeSettings()),
    [openSettings, closeSettings],
  );

  useGlobalShortcuts({
    setActiveTab,
    setHelpOpen: setHelpOpenCb,
    setSettingsOpen: setSettingsOpenCb,
  });

  return (
    <div className="flex flex-col h-screen bg-composer-bg text-composer-text">
      <AppHeader
        onSettingsOpen={() => openSettings()}
        onHelpOpen={() => setHelpOpen(true)}
        onTourStart={resumeOrStartTour}
      />
      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={closeSettings}
        onResetTour={() => {
          localStorage.removeItem("composer-tour-seen");
          localStorage.removeItem("composer-tour-resume");
        }}
      />
      <main className="relative flex-1 overflow-hidden">
        <Activity mode={activeTab === "import" ? "visible" : "hidden"}>
          <div className="absolute inset-0 flex flex-col">
            <ImportPanel />
          </div>
        </Activity>
        <Activity mode={activeTab === "edit" ? "visible" : "hidden"}>
          <div className="absolute inset-0 flex flex-col">
            <EditPanel />
          </div>
        </Activity>
        <Activity mode={activeTab === "sync" ? "visible" : "hidden"}>
          <div className="absolute inset-0 flex flex-col">
            <SyncPanel />
          </div>
        </Activity>
        <Activity mode={activeTab === "timeline" ? "visible" : "hidden"}>
          <div className="absolute inset-0 flex flex-col">
            <TimelinePanel />
          </div>
        </Activity>
        <Activity mode={activeTab === "preview" ? "visible" : "hidden"}>
          <div className="absolute inset-0 flex flex-col">
            <PreviewPanel />
          </div>
        </Activity>
        <Activity mode={activeTab === "export" ? "visible" : "hidden"}>
          <div className="absolute inset-0 flex flex-col">
            <ExportPanel />
          </div>
        </Activity>
      </main>
      {source && <AudioEngine />}
      {showPlayer && <AudioPlayer />}
      <GuideCard state={guideCard} onSkip={skipGuideCard} />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation} strict>
        <AppContent />
        <ConfirmModalHost />
        <DivergenceModalHost />
        <LyricsImportModalHost />
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            style: {
              background: "var(--color-composer-bg-elevated)",
              border: "1px solid var(--color-composer-border)",
              color: "var(--color-composer-text)",
            },
          }}
        />
      </LazyMotion>
    </QueryClientProvider>
  );
};

export { App };
