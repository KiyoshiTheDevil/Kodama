// The phone's Together tab: a page of its own, where the desktop opens a popover from the
// sidebar. Outside a room, starting or joining one; in a room, its card, header and people.
import { useEffect } from "react";
import { useTogether, setIdentity } from "./together.js";
import { JoinPopoverBody, TogetherSidebar } from "./TogetherSidebar.jsx";
import { TogetherRoomHeader, TogetherPeopleTab } from "./TogetherRoomTab.jsx";

export function TogetherView({ name, avatar }) {
  const r = useTogether();
  useEffect(() => { setIdentity(name, avatar); }, [name, avatar]);
  const inRoom = r.status !== "idle" && r.status !== "closed";
  const myName = (name || "").trim() || "Kodama";
  return (
    <div style={{ padding: "12px 16px 24px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 560, margin: "0 auto" }}>
      {inRoom ? (
        <>
          <TogetherSidebar name={name} avatar={avatar} roomOnly />
          {r.status !== "waiting" && <TogetherRoomHeader />}
          {r.status !== "waiting" && <TogetherPeopleTab />}
        </>
      ) : (
        <JoinPopoverBody page name={myName} onDone={() => {}} />
      )}
    </div>
  );
}
