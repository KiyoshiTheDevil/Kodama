import { LandingFooter } from "@/pages/landing/sections/landing-footer";
import { LandingNav } from "@/pages/landing/sections/landing-nav";
import type { ReactNode } from "react";

interface LandingLayoutProps {
  children: ReactNode;
}

const LandingLayout: React.FC<LandingLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-composer-bg text-composer-text flex flex-col">
      <LandingNav />
      <main className="flex-1">{children}</main>
      <LandingFooter />
    </div>
  );
};

export { LandingLayout };
