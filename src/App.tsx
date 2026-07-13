import { Navigate, Route, Routes } from "react-router-dom";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { CastPage } from "@/features/cast/CastPage";
import { ComicExportPage } from "@/features/comicexport/ComicExportPage";
import { FrameLabPage } from "@/features/framelab/FrameLabPage";
import { MotionPage } from "@/features/motion/MotionPage";
import { PagesPage } from "@/features/pages/PagesPage";
import { PanelLabPage } from "@/features/panellab/PanelLabPage";
import { PrevizPage } from "@/features/previz/PrevizPage";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { ScriptPage } from "@/features/script/ScriptPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { StoryboardPage } from "@/features/storyboard/StoryboardPage";
import { TimelinePage } from "@/features/timeline/TimelinePage";

const App = () => (
  <Routes>
    <Route path="/" element={<ProjectsPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/p/:projectId" element={<WorkspaceShell />}>
      <Route index element={<Navigate to="script" replace />} />
      <Route path="script" element={<ScriptPage />} />
      <Route path="cast" element={<CastPage />} />
      {/* Film stages */}
      <Route path="storyboard" element={<StoryboardPage />} />
      <Route path="previz" element={<PrevizPage />} />
      <Route path="framelab" element={<FrameLabPage />} />
      <Route path="motion" element={<MotionPage />} />
      <Route path="timeline" element={<TimelinePage />} />
      {/* Comic stages */}
      <Route path="pages" element={<PagesPage />} />
      <Route path="panels" element={<PanelLabPage />} />
      <Route path="export" element={<ComicExportPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
