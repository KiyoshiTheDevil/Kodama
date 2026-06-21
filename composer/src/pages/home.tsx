import { App } from "@/App";
import { PageHead } from "@/seo/page-head";
import { organizationSchema, softwareApplicationSchema } from "@/seo/schemas";
import { ClientOnly } from "@/ui/client-only";

const TITLE = "Composer ・ Free TTML Lyrics Editor";
const DESCRIPTION =
  "Composer by Better Lyrics is a free browser-based TTML creator for Apple Music and Spotify synced lyrics. Tap to sync words, edit timing in a visual timeline, and export standard TTML files with word-level precision.";

const AppFallback: React.FC = () => (
  <div className="flex items-center justify-center h-screen bg-composer-bg text-composer-text-muted text-sm">
    Loading Composer
  </div>
);

const HomePage: React.FC = () => {
  return (
    <>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        path="/"
        jsonLd={[softwareApplicationSchema("Composer", DESCRIPTION, "/"), organizationSchema()]}
      />
      <ClientOnly fallback={<AppFallback />}>
        <App />
      </ClientOnly>
    </>
  );
};

export default HomePage;
