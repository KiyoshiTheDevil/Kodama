import { PROJECT_STORE_NAME, setInStore } from "@/lib/persistence-idb";

// -- Constants -----------------------------------------------------------------

const CURRENT_KEY = "current";
const AUDIO_KEY = "current-audio";

// -- Types ---------------------------------------------------------------------

interface SeedAudioFileArgs {
  name: string;
  type: string;
  data: ArrayBuffer;
}

// -- Helpers -------------------------------------------------------------------

function seedProject(project: unknown): Promise<void> {
  return setInStore(PROJECT_STORE_NAME, CURRENT_KEY, project);
}

function seedAudioFile(args: SeedAudioFileArgs): Promise<void> {
  return setInStore(PROJECT_STORE_NAME, AUDIO_KEY, args);
}

// -- Exports -------------------------------------------------------------------

export { seedProject, seedAudioFile };
