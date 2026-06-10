import { Navigate, Route, Routes } from "react-router-dom";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { CastPage } from "@/features/cast/CastPage";
import { FrameLabPage } from "@/features/framelab/FrameLabPage";
import { MotionPage } from "@/features/motion/MotionPage";
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
      <Route path="storyboard" element={<StoryboardPage />} />
      <Route path="framelab" element={<FrameLabPage />} />
      <Route path="motion" element={<MotionPage />} />
      <Route path="timeline" element={<TimelinePage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
