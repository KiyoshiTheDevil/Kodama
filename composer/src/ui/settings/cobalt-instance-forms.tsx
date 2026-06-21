import { Button } from "@/ui/button";
import { cn } from "@/utils/cn";
import { displayHostFromUrl, ensureHttpScheme, isValidHttpUrl } from "@/utils/url";
import { useState } from "react";

// -- Helpers ------------------------------------------------------------------

const focusOnMount = (el: HTMLInputElement | null) => el?.focus();

// -- Cobalt Instance Forms ----------------------------------------------------

const CobaltInstanceEditRow: React.FC<{
  initialLabel: string;
  initialUrl: string;
  onSave: (label: string, url: string) => void;
  onCancel: () => void;
}> = ({ initialLabel, initialUrl, onSave, onCancel }) => {
  const [label, setLabel] = useState(() => initialLabel);
  const [url, setUrl] = useState(() => displayHostFromUrl(initialUrl));

  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  const urlValid = trimmedUrl.length > 0 && isValidHttpUrl(trimmedUrl);
  const showUrlError = trimmedUrl.length > 0 && !urlValid;
  const canSave = trimmedLabel.length > 0 && urlValid;

  const submit = () => {
    if (!canSave) return;
    onSave(trimmedLabel, ensureHttpScheme(url));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-1.5 p-2 rounded-lg border border-composer-accent/50 bg-composer-accent/10">
      <div className="flex items-center gap-2">
        <input
          ref={focusOnMount}
          type="text"
          aria-label="Instance name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-32 h-6 px-2 text-xs rounded-md bg-composer-input border border-composer-border focus:outline-none focus:border-composer-accent text-composer-text"
        />
        <input
          type="url"
          inputMode="url"
          aria-label="Instance URL"
          value={url}
          onChange={(e) => setUrl(e.target.value.replace(/\s+/g, ""))}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex-1 h-6 px-2 text-xs rounded-md bg-composer-input border focus:outline-none text-composer-text font-mono",
            showUrlError ? "border-composer-error" : "border-composer-border focus:border-composer-accent",
          )}
        />
        <Button size="sm" variant="primary" onClick={submit} disabled={!canSave} className="h-6 px-2.5">
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel} className="h-6 px-2.5">
          Cancel
        </Button>
      </div>
      {showUrlError && <span className="text-[11px] text-composer-error-text">Enter a valid http(s) URL.</span>}
    </div>
  );
};

const CobaltInstanceAddForm: React.FC<{
  onAdd: (label: string, url: string) => void;
}> = ({ onAdd }) => {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const trimmedLabel = label.trim();
  const trimmedUrl = url.trim();
  const urlValid = trimmedUrl.length > 0 && isValidHttpUrl(trimmedUrl);
  const showUrlError = trimmedUrl.length > 0 && !urlValid;
  const canAdd = trimmedLabel.length > 0 && urlValid;

  const submit = () => {
    if (!canAdd) return;
    onAdd(trimmedLabel, ensureHttpScheme(url));
    setLabel("");
    setUrl("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip whitespace as it's typed/pasted; URLs can never contain spaces
    setUrl(e.target.value.replace(/\s+/g, ""));
  };

  return (
    <div className="flex flex-col gap-1.5 mt-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label="Instance name"
          placeholder="Name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-32 h-7 px-2 text-xs rounded-md bg-composer-input border border-composer-border focus:outline-none focus:border-composer-accent text-composer-text placeholder:text-composer-text-muted"
        />
        <input
          type="url"
          inputMode="url"
          aria-label="Instance URL"
          placeholder="https://your-cobalt-instance"
          value={url}
          onChange={handleUrlChange}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex-1 h-7 px-2 text-xs rounded-md bg-composer-input border focus:outline-none text-composer-text placeholder:text-composer-text-muted font-mono",
            showUrlError ? "border-composer-error" : "border-composer-border focus:border-composer-accent",
          )}
        />
        <Button size="sm" variant="primary" onClick={submit} disabled={!canAdd}>
          Add
        </Button>
      </div>
      {showUrlError && <span className="text-[11px] text-composer-error-text">Enter a valid http(s) URL.</span>}
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { CobaltInstanceEditRow, CobaltInstanceAddForm };
