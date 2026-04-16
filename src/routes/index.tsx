import { createFileRoute } from "@tanstack/react-router";
import { AssetViewer } from "@/components/AssetViewer";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "HQ Asset Overview — Local Excel Viewer" },
      { name: "description", content: "Privacy-first Excel asset viewer for HQ inventory management. All data stays on your device." },
    ],
  }),
});

function Index() {
  return <AssetViewer />;
}
