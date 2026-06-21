import { type GatedStep, TOUR_GATED_STEPS, createTourSteps } from "@/tour/tour-steps";
import type { GuideCardState } from "@/tour/guide-card";
import { driver, type Driver, type DriveStep } from "driver.js";
import { useCallback, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

// -- Constants ----------------------------------------------------------------

const STORAGE_KEY = "composer-tour-seen";
const RESUME_KEY = "composer-tour-resume";
const GATE_CHECK_INTERVAL = 300;
const GATE_SUCCESS_DELAY = 800;

// -- Resume state persistence -------------------------------------------------

function saveResumeState(stepIndex: number) {
  localStorage.setItem(RESUME_KEY, JSON.stringify({ stepIndex }));
}

function loadResumeState(): { stepIndex: number } | null {
  const raw = localStorage.getItem(RESUME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { stepIndex: number };
  } catch {
    return null;
  }
}

function clearResumeState() {
  localStorage.removeItem(RESUME_KEY);
}

// -- Hook ---------------------------------------------------------------------

function useTour() {
  const driverRef = useRef<Driver | null>(null);
  const gateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [guideCard, setGuideCard] = useState<GuideCardState | null>(null);
  const reducedMotion = useReducedMotion();

  const shouldShowTour = !localStorage.getItem(STORAGE_KEY);

  const markTourSeen = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const clearGateInterval = useCallback(() => {
    if (gateIntervalRef.current) {
      clearInterval(gateIntervalRef.current);
      gateIntervalRef.current = null;
    }
  }, []);

  const destroyDriver = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
      driverRef.current = null;
    }
  }, []);

  const createDriverInstance = useCallback(
    (steps: DriveStep[], onStepChange?: (index: number) => void) => {
      return driver({
        steps,
        popoverClass: "composer-tour",
        overlayColor: "#000",
        overlayOpacity: 0.6,
        stagePadding: 8,
        stageRadius: 8,
        animate: !reducedMotion,
        smoothScroll: false,
        showProgress: true,
        progressText: "{{current}} / {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        allowClose: true,
        onHighlighted: (_el, _step, opts) => {
          const idx = opts.state.activeIndex;
          if (idx !== undefined) {
            onStepChange?.(idx);
          }
        },
        onDestroyed: () => {
          driverRef.current = null;
        },
      });
    },
    [reducedMotion],
  );

  const startGuideCard = useCallback(
    (gatedStep: GatedStep, totalSteps: number, patchedSteps: DriveStep[]) => {
      clearGateInterval();

      const nextStepIndex = gatedStep.stepIndex + 1;
      const stepLabel = `Step ${gatedStep.stepIndex + 1} / ${totalSteps}`;

      setGuideCard({ task: gatedStep.task, stepLabel, isComplete: false });
      saveResumeState(gatedStep.stepIndex);

      gateIntervalRef.current = setInterval(() => {
        if (gatedStep.gateCheck()) {
          clearGateInterval();
          setGuideCard((prev) => (prev ? { ...prev, isComplete: true } : null));

          setTimeout(() => {
            setGuideCard(null);
            const d = createDriverInstance(patchedSteps, (idx) => saveResumeState(idx));
            driverRef.current = d;
            d.drive(nextStepIndex);
          }, GATE_SUCCESS_DELAY);
        }
      }, GATE_CHECK_INTERVAL);
    },
    [clearGateInterval, createDriverInstance],
  );

  const patchStepsWithGates = useCallback(
    (steps: DriveStep[]): DriveStep[] => {
      const gatedIndices = new Map(TOUR_GATED_STEPS.map((g) => [g.stepIndex, g]));

      const patched: DriveStep[] = steps.map((step, idx) => {
        const gatedStep = gatedIndices.get(idx);
        if (!gatedStep) return step;

        return {
          ...step,
          onHighlighted: (_el: Element | undefined, _step: DriveStep, opts: { state: { activeIndex?: number } }) => {
            // If going backwards (user clicked Back), don't gate - just let it show
            const activeIdx = opts.state.activeIndex ?? idx;
            if (activeIdx < idx) return;

            if (gatedStep.gateCheck()) {
              setTimeout(() => {
                driverRef.current?.moveNext();
              }, 100);
              return;
            }

            destroyDriver();
            startGuideCard(gatedStep, steps.length, patched);
          },
        };
      });

      return patched;
    },
    [destroyDriver, startGuideCard],
  );

  const skipGuideCard = useCallback(() => {
    clearGateInterval();
    setGuideCard(null);

    const steps = createTourSteps();
    const gatedIndices = new Set(TOUR_GATED_STEPS.map((g) => g.stepIndex));

    let currentGatedIdx = 0;
    for (const gs of TOUR_GATED_STEPS) {
      if (!gs.gateCheck()) {
        currentGatedIdx = gs.stepIndex;
        break;
      }
    }

    let nextIdx = currentGatedIdx + 1;
    while (nextIdx < steps.length && gatedIndices.has(nextIdx)) {
      nextIdx++;
    }

    if (nextIdx < steps.length) {
      const patchedSteps = patchStepsWithGates(steps);
      const d = createDriverInstance(patchedSteps, (idx) => saveResumeState(idx));
      driverRef.current = d;
      d.drive(nextIdx);
    }
  }, [clearGateInterval, createDriverInstance, patchStepsWithGates]);

  const driveTour = useCallback(
    (startIndex?: number) => {
      destroyDriver();
      clearGateInterval();
      setGuideCard(null);

      const steps = createTourSteps();
      const patchedSteps = patchStepsWithGates(steps);

      const d = createDriverInstance(patchedSteps, (idx) => saveResumeState(idx));
      driverRef.current = d;
      d.drive(startIndex ?? 0);
    },
    [destroyDriver, clearGateInterval, createDriverInstance, patchStepsWithGates],
  );

  const startTour = useCallback(() => {
    markTourSeen();
    clearResumeState();
    driveTour();
  }, [markTourSeen, driveTour]);

  const resumeOrStartTour = useCallback(() => {
    const isActive = driverRef.current?.isActive() || guideCard !== null;
    if (isActive) {
      destroyDriver();
      clearGateInterval();
      setGuideCard(null);
      return;
    }

    const resume = loadResumeState();
    if (resume) {
      markTourSeen();
      driveTour(resume.stepIndex);
    } else {
      startTour();
    }
  }, [guideCard, destroyDriver, clearGateInterval, markTourSeen, driveTour, startTour]);

  return {
    startTour,
    resumeOrStartTour,
    shouldShowTour,
    guideCard,
    skipGuideCard,
  };
}

// -- Exports ------------------------------------------------------------------

export { useTour };
