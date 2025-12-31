import React from 'react';
import ReactDOM from 'react-dom/client';
import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion';

function App() {
  return (
    <div>
      <VibeKanbanWebCompanion />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
