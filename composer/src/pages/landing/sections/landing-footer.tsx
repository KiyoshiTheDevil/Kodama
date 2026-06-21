import { Link } from "react-router-dom";

const LandingFooter: React.FC = () => {
  return (
    <footer className="border-t border-composer-border px-6 py-12 mt-10">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div>
          <h3 className="font-semibold text-composer-text mb-3">Composer</h3>
          <ul className="space-y-2 text-composer-text-secondary">
            <li>
              <Link to="/" className="hover:text-composer-text">
                Open the editor
              </Link>
            </li>
            <li>
              <Link to="/ttml-maker" className="hover:text-composer-text">
                TTML maker
              </Link>
            </li>
            <li>
              <Link to="/ttml-editor" className="hover:text-composer-text">
                TTML editor
              </Link>
            </li>
            <li>
              <Link to="/ttml-generator" className="hover:text-composer-text">
                TTML generator
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-composer-text mb-3">Converters</h3>
          <ul className="space-y-2 text-composer-text-secondary">
            <li>
              <Link to="/lrc-to-ttml" className="hover:text-composer-text">
                LRC to TTML
              </Link>
            </li>
            <li>
              <Link to="/srt-to-ttml" className="hover:text-composer-text">
                SRT to TTML
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-composer-text mb-3">Platforms</h3>
          <ul className="space-y-2 text-composer-text-secondary">
            <li>
              <Link to="/apple-music-synced-lyrics" className="hover:text-composer-text">
                Apple Music lyrics
              </Link>
            </li>
            <li>
              <Link to="/spotify-synced-lyrics" className="hover:text-composer-text">
                Spotify lyrics
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-composer-text mb-3">Learn</h3>
          <ul className="space-y-2 text-composer-text-secondary">
            <li>
              <Link to="/guides" className="hover:text-composer-text">
                Guides
              </Link>
            </li>
            <li>
              <a
                href="https://better-lyrics.boidu.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-composer-text"
              >
                Better Lyrics extension
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-composer-border text-xs text-composer-text-muted flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <p>Composer by Better Lyrics ・ Free to use</p>
        <p>Open source ・ No tracking ・ No signup</p>
      </div>
    </footer>
  );
};

export { LandingFooter };
