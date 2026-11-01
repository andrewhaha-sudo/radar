import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Globe2, Gamepad2 } from "lucide-react";
import { CampusExplorer } from "@/components/map/CampusExplorer";

const GeographicMap = lazy(() =>
  import("./GeographicMapPage").then((m) => ({ default: m.GeographicMapPage })),
);

export function MapPage() {
  const [params, setParams] = useSearchParams();
  const geographic = params.get("view") === "geographic";
  return (
    <div>
      <nav
        className="flex flex-wrap gap-2 border-b border-border bg-card px-4 py-2"
        aria-label="Map views"
      >
        {[
          { id: "campus", label: "Campus explorer", icon: Gamepad2 },
          { id: "geographic", label: "Geographic map", icon: Globe2 },
        ].map((view) => (
          <button
            key={view.id}
            aria-current={
              (geographic ? "geographic" : "campus") === view.id
                ? "page"
                : undefined
            }
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${(geographic ? "geographic" : "campus") === view.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() =>
              setParams((current) => {
                const next = new URLSearchParams(current);
                next.set("view", view.id);
                return next;
              })
            }
          >
            <view.icon size={16} />
            {view.label}
          </button>
        ))}
      </nav>
      {geographic ? (
        <Suspense fallback={<p className="p-6">Loading geographic map…</p>}>
          <GeographicMap />
        </Suspense>
      ) : (
        <CampusExplorer />
      )}
    </div>
  );
}
