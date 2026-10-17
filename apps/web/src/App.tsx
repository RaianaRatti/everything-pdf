import { Navigate, Outlet, createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { CommandPalette } from "./components/CommandPalette";
import { SettingsButton } from "./components/SettingsButton";
import { Home } from "./routes/Home";

// Tool pages load pdf.js and the editor UI; keep them out of the home page bundle.
const workspace = () => import("./routes/Workspace").then((m) => ({ Component: m.Workspace }));

function Root() {
  return (
    <>
      <Outlet />
      <CommandPalette />
      <SettingsButton />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/workspace", lazy: workspace },
      {
        path: "/images-to-pdf",
        lazy: () => import("./routes/ImagesToPdf").then((m) => ({ Component: m.ImagesToPdf })),
      },
      {
        path: "/batch",
        lazy: () => import("./routes/Batch").then((m) => ({ Component: m.Batch })),
      },
      {
        path: "/compare",
        lazy: () => import("./routes/Compare").then((m) => ({ Component: m.Compare })),
      },
      {
        path: "/scan",
        lazy: () => import("./routes/Scan").then((m) => ({ Component: m.Scan })),
      },
      { path: "/:toolId", lazy: workspace },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
