import { HEADING, PROSE } from "@/ui/help-sections/shared";

// -- About --------------------------------------------------------------------

const AboutSection: React.FC = () => (
  <div className="space-y-5">
    <div className="relative -mx-6 -mt-6">
      <div className="absolute inset-0 bg-gradient-to-b from-composer-accent/20 to-transparent pointer-events-none" />
      <div className="relative px-6 pt-7 pb-8 flex items-center gap-5">
        <img src="/logo.svg" alt="Composer" className="size-14 shrink-0" />
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">Composer</h2>
          <p className="text-sm text-composer-text-secondary">The lyrics editor for Better Lyrics.</p>
          <p className="text-xs text-composer-text-muted font-mono mt-2">v{__APP_VERSION__}</p>
        </div>
      </div>
    </div>

    <div>
      <h4 className={HEADING}>What it is</h4>
      <p className={PROSE}>
        Free and open-source, runs entirely in your browser. No accounts, nothing leaves your machine. Bring your audio
        and lyrics, sync them up, export TTML.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Open source</h4>
      <p className={PROSE}>
        AGPL v3. Source on{" "}
        <a
          href="https://github.com/better-lyrics/composer"
          target="_blank"
          rel="noopener noreferrer"
          className="text-composer-text underline underline-offset-2 hover:text-composer-text-bright"
        >
          GitHub
        </a>
        . PRs welcome if you spot something to fix.
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Commercial use</h4>
      <p className={PROSE}>
        Composer is also available under a commercial license that removes the AGPL copyleft obligations and covers
        commercial use of its output, such as a label or distributor publishing generated lyrics in a release. For
        commercial or enterprise licensing, reach out to{" "}
        <a
          href="mailto:composer@boidu.dev"
          className="text-composer-text underline underline-offset-2 hover:text-composer-text-bright"
        >
          composer@boidu.dev
        </a>
        .
      </p>
    </div>

    <div>
      <h4 className={HEADING}>Community</h4>
      <ul className={`${PROSE} list-disc pl-4 space-y-1`}>
        <li>
          <a
            href="https://discord.gg/UsHE3d5fWF"
            target="_blank"
            rel="noopener noreferrer"
            className="text-composer-text underline underline-offset-2 hover:text-composer-text-bright"
          >
            Discord
          </a>{" "}
          for questions and chat.
        </li>
        <li>
          <a
            href="https://github.com/better-lyrics/composer/issues/new/choose"
            target="_blank"
            rel="noopener noreferrer"
            className="text-composer-text underline underline-offset-2 hover:text-composer-text-bright"
          >
            File an issue
          </a>{" "}
          if something's broken.
        </li>
      </ul>
    </div>

    <div>
      <h4 className={HEADING}>Made by</h4>
      <p className={PROSE}>
        <a
          href="https://boidu.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="text-composer-text underline underline-offset-2 hover:text-composer-text-bright"
        >
          Boidu
        </a>
        , with thanks to everyone in the{" "}
        <a
          href="https://betterlyrics.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-composer-text underline underline-offset-2 hover:text-composer-text-bright"
        >
          Better Lyrics
        </a>{" "}
        community who's tested it, reported bugs, and put up with the rough edges.
      </p>
    </div>
  </div>
);

// -- Exports ------------------------------------------------------------------

export { AboutSection };
