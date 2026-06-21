import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { YouTubeUrlInput } from "@/audio/youtube-url-input";
import { useAudioStore } from "@/stores/audio";
import { render } from "@/test/render";

const VALID_VIDEO_ID = "dQw4w9WgXcQ";

function simulateTunnelSuccess(videoId: string): void {
  useAudioStore.setState({ isLoading: true });
  const file = new File([new Uint8Array([1, 2, 3])], `${videoId}.opus`, { type: "audio/ogg" });
  useAudioStore.getState().setYouTubeFile(file);
  useAudioStore.getState().setYouTubeLoadError(null);
  useAudioStore.setState({ isLoading: false });
}

function simulateTunnelFailure(message: string): void {
  useAudioStore.setState({ isLoading: true });
  useAudioStore.getState().setSource(null);
  useAudioStore.getState().setYouTubeLoadError(message);
  useAudioStore.setState({ isLoading: false });
}

describe("YouTubeUrlInput", () => {
  it("renders the input and a disabled Load button when empty", async () => {
    const screen = await render(<YouTubeUrlInput />);
    const input = screen.getByPlaceholder(/YouTube URL/i);
    await expect.element(input).toBeInTheDocument();
    const loadButton = screen.getByRole("button", { name: /Load$/ });
    expect((loadButton.element() as HTMLButtonElement).disabled).toBe(true);
  });

  it("labels the URL input", async () => {
    const screen = await render(<YouTubeUrlInput />);
    await expect.element(screen.getByRole("textbox", { name: "YouTube URL or video ID" })).toBeInTheDocument();
  });

  it("enables the Load button once a non-empty value is entered", async () => {
    const screen = await render(<YouTubeUrlInput />);
    await screen.getByPlaceholder(/YouTube URL/i).fill(VALID_VIDEO_ID);
    const loadButton = screen.getByRole("button", { name: /Load$/ });
    expect((loadButton.element() as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows an error message when an invalid input is submitted", async () => {
    const screen = await render(<YouTubeUrlInput />);
    await screen.getByPlaceholder(/YouTube URL/i).fill("not a valid id");
    await screen.getByRole("button", { name: /Load$/ }).click();
    await expect.element(screen.getByText(/doesn't look like a valid YouTube/)).toBeInTheDocument();
  });

  it("clears the error as the user types again", async () => {
    const screen = await render(<YouTubeUrlInput />);
    const input = screen.getByPlaceholder(/YouTube URL/i);
    await input.fill("not valid");
    await screen.getByRole("button", { name: /Load$/ }).click();
    await expect.element(screen.getByText(/doesn't look like a valid YouTube/)).toBeInTheDocument();
    await input.fill("not validX");
    await expect.element(screen.getByText(/doesn't look like a valid YouTube/)).not.toBeInTheDocument();
  });

  it("submits on Enter when the input has focus", async () => {
    const screen = await render(<YouTubeUrlInput />);
    const input = screen.getByPlaceholder(/YouTube URL/i);
    await input.fill("not-valid");
    (input.element() as HTMLInputElement).focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(screen.getByText(/doesn't look like a valid YouTube/)).toBeInTheDocument();
  });

  it("disables the input and shows 'Loading' while isLoading is true", async () => {
    useAudioStore.setState({ isLoading: true });
    const screen = await render(<YouTubeUrlInput />);
    const input = screen.getByPlaceholder(/YouTube URL/i).element() as HTMLInputElement;
    expect(input.disabled).toBe(true);
    await expect.element(screen.getByRole("button", { name: /Loading/ })).toBeInTheDocument();
  });

  it("clears the input after a successful YouTube load", async () => {
    const screen = await render(<YouTubeUrlInput />);
    const input = screen.getByPlaceholder(/YouTube URL/i);
    await input.fill(VALID_VIDEO_ID);
    await screen.getByRole("button", { name: /Load$/ }).click();
    simulateTunnelSuccess(VALID_VIDEO_ID);
    await expect.poll(() => (input.element() as HTMLInputElement).value).toBe("");
  });

  it("keeps the URL in the input when the YouTube load fails", async () => {
    const screen = await render(<YouTubeUrlInput />);
    const input = screen.getByPlaceholder(/YouTube URL/i);
    await input.fill(VALID_VIDEO_ID);
    await screen.getByRole("button", { name: /Load$/ }).click();
    simulateTunnelFailure("Could not load that video. Try again.");
    await expect.poll(() => (input.element() as HTMLInputElement).value).toBe(VALID_VIDEO_ID);
    await expect.poll(() => (input.element() as HTMLInputElement).disabled).toBe(false);
  });

  it("clears the stale upstream load error when the user starts editing again", async () => {
    const screen = await render(<YouTubeUrlInput />);
    const input = screen.getByPlaceholder(/YouTube URL/i);
    await input.fill(VALID_VIDEO_ID);
    await screen.getByRole("button", { name: /Load$/ }).click();
    simulateTunnelFailure("Could not load that video. Try again.");
    await expect.poll(() => useAudioStore.getState().youtubeLoadError).toBe("Could not load that video. Try again.");
    await input.fill(`${VALID_VIDEO_ID}X`);
    await expect.poll(() => useAudioStore.getState().youtubeLoadError).toBeNull();
  });
});
