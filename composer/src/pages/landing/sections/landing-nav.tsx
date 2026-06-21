import { Button } from "@/ui/button";
import { IconArrowRight } from "@tabler/icons-react";
import { Link } from "react-router-dom";

const LandingNav: React.FC = () => {
  return (
    <header className="px-6 py-5 border-b border-composer-border sticky top-0 z-50 bg-composer-bg/90 backdrop-blur-md">
      <nav className="max-w-6xl mx-auto flex items-center justify-between gap-6">
        <Link to="/ttml-maker" className="flex items-center gap-2 select-none">
          <img src="/logo.svg" alt="" className="size-6" />
          <span className="font-semibold text-composer-text">Composer</span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm text-composer-text-secondary">
          <Link to="/ttml-maker" className="hover:text-composer-text">
            Maker
          </Link>
          <Link to="/lrc-to-ttml" className="hover:text-composer-text">
            LRC to TTML
          </Link>
          <Link to="/srt-to-ttml" className="hover:text-composer-text">
            SRT to TTML
          </Link>
          <Link to="/guides" className="hover:text-composer-text">
            Guides
          </Link>
        </div>
        <Link to="/">
          <Button variant="primary" size="sm" hasIcon>
            Open editor
            <IconArrowRight size={12} />
          </Button>
        </Link>
      </nav>
    </header>
  );
};

export { LandingNav };
