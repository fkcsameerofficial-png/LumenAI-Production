import React, { useState } from "react";
import { Sidebar } from "../components/Sidebar";
import { ChatWindow } from "../components/ChatWindow";
import { SettingsModal } from "../components/SettingsModal";

export function Chat() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden sm:block w-72 shrink-0">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      {/* Mobile sidebar drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[85%]">
            <Sidebar
              onOpenSettings={() => {
                setSettingsOpen(true);
                setMobileSidebarOpen(false);
              }}
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <ChatWindow onOpenSidebar={() => setMobileSidebarOpen(true)} />
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
