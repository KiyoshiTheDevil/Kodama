import { routes } from "@/router";
import { ViteReactSSG } from "vite-react-ssg";
import "@/index.css";

// Kodama serves this build under a sub-path (vite `base`), so the router must use the
// same value as its basename — vite-react-ssg does not derive it from BASE_URL itself.
export const createRoot = ViteReactSSG({ routes, basename: import.meta.env.BASE_URL });
