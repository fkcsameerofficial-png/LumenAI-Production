import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

type Project = { id: string; name: string; description: string; updated_at: string };
type ProjectFile = { id: string; path: string; content: string };
type Task = { id: string; prompt: string; status: string; result?: string; error?: string; created_at: string };

export function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [prompt, setPrompt] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProjects = async () => {
    const data = await api.get<{ projects: Project[] }>("/api/projects");
    setProjects(data.projects);
    if (!active && data.projects[0]) openProject(data.projects[0]);
  };

  const openProject = async (project: Project) => {
    setActive(project);
    const data = await api.get<{ project: Project; files: ProjectFile[] }>(`/api/projects/${project.id}`);
    setFiles(data.files);
    const taskData = await api.get<{ tasks: Task[] }>(`/api/projects/${project.id}/tasks`);
    setTasks(taskData.tasks);
    setSelectedFile(data.files[0] ?? null);
  };

  useEffect(() => { void loadProjects(); }, []);

  const createProject = async () => {
    if (!newName.trim()) return;
    const data = await api.post<{ project: Project }>("/api/projects", { name: newName.trim() });
    setNewName("");
    await openProject(data.project);
    await loadProjects();
  };

  const saveFile = async () => {
    if (!active || !selectedFile) return;
    setSaving(true);
    try {
      await api.put(`/api/projects/${active.id}/files`, { path: selectedFile.path, content: selectedFile.content });
      await openProject(active);
    } finally { setSaving(false); }
  };

  const runTask = async () => {
    if (!active || !prompt.trim()) return;
    const provider = "gemini";
    const model = "gemini-3.6-flash";
    await api.post(`/api/projects/${active.id}/tasks`, { prompt: prompt.trim(), provider, model });
    setPrompt("");
    await openProject(active);
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-50 dark:bg-slate-950">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="font-semibold">Lumen Projects</div>
          <span className="text-xs text-slate-500">AI coding workspace</span>
        </div>
        <button onClick={() => navigate("/")} className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">← Chat</button>
      </div>
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 dark:border-slate-800 p-3 overflow-y-auto md:w-64 md:border-b-0 md:border-r">
          <div className="flex gap-2 mb-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && void createProject()} placeholder="New project" className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm" />
            <button onClick={() => void createProject()} className="rounded-lg bg-brand-600 text-white px-3">+</button>
          </div>
          <div className="space-y-1">
            {projects.map(p => <button key={p.id} onClick={() => void openProject(p)} className={`w-full text-left rounded-lg px-3 py-2 text-sm ${active?.id === p.id ? "bg-brand-100 dark:bg-brand-900/40" : "hover:bg-slate-200 dark:hover:bg-slate-800"}`}>{p.name}</button>)}
          </div>
        </aside>
        <main className="flex-1 min-w-0 flex flex-col">
          {!active ? <div className="m-auto text-slate-500">Create a project to start.</div> : <>
            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
              <div className="w-full shrink-0 border-b border-slate-200 dark:border-slate-800 p-3 overflow-y-auto md:w-56 md:border-b-0 md:border-r">
                <div className="text-xs uppercase text-slate-500 mb-2">Files</div>
                {files.map(f => <button key={f.id} onClick={() => setSelectedFile(f)} className={`w-full text-left text-sm truncate rounded px-2 py-1.5 ${selectedFile?.id === f.id ? "bg-slate-200 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-900"}`}>{f.path}</button>)}
                {files.length === 0 && <div className="text-xs text-slate-500">No files yet. Ask the agent to create them.</div>}
              </div>
              <div className="flex-1 min-w-0 p-3 flex flex-col">
                {selectedFile ? <>
                  <div className="flex items-center justify-between mb-2"><span className="text-sm font-medium">{selectedFile.path}</span><button disabled={saving} onClick={() => void saveFile()} className="text-xs rounded bg-brand-600 text-white px-3 py-1.5">{saving ? "Saving..." : "Save"}</button></div>
                  <textarea value={selectedFile.content} onChange={e => setSelectedFile({ ...selectedFile, content: e.target.value })} className="flex-1 min-h-0 resize-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 font-mono text-xs outline-none" />
                </> : <div className="m-auto text-sm text-slate-500">Select a file.</div>}
              </div>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-3">
              <div className="text-sm font-medium">AI Agent</div>
              <div className="flex flex-col gap-2 md:flex-row"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Tell Lumen what to build or change in this project..." className="w-full min-h-24 max-h-48 resize-y rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-sm md:min-h-16 md:flex-1 md:max-h-32" /><button onClick={() => void runTask()} disabled={!prompt.trim()} className="w-full rounded-xl bg-brand-600 text-white px-4 py-2 text-sm disabled:opacity-50 md:w-auto md:self-end">Build</button></div>
              <div className="max-h-28 overflow-y-auto space-y-1">{tasks.slice(0, 5).map(t => <div key={t.id} className="text-xs rounded-lg bg-slate-100 dark:bg-slate-900 px-3 py-2"><b>{t.status}</b> — {t.result || t.error || t.prompt}</div>)}</div>
            </div>
          </>}
        </main>
      </div>
    </div>
  );
}
