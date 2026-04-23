import { createFileRoute } from "@tanstack/react-router";
import { AssetViewer } from "@/components/AssetViewer";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <AssetViewer />;
}
