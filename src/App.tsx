import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LayoutRating from "./pages/LayoutRating";
import LayoutTest from "./pages/LayoutTest";
import HeroFractionRating from "./pages/HeroFractionRating";
import Help from "./pages/Help";
import { remoteLogger } from "@/lib/remoteLogger";
import WallpaperStudio from "./pages/WallpaperStudio";

const queryClient = new QueryClient();

const App = () => {
  // Global safety net for unhandled promise rejections - sends to remote logging
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      remoteLogger.error("unhandled", "Promise rejection", {
        reason: event.reason?.message ?? String(event.reason),
        stack: event.reason?.stack,
      });
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<WallpaperStudio />} />
            <Route path="/classic" element={<Index />} />
            <Route path="/help" element={<Help />} />
            {/* DEV-ONLY: Layout tools for algorithm tuning */}
            {import.meta.env.DEV && (
              <>
                <Route path="/layout-rating" element={<LayoutRating />} />
                <Route path="/layout-test" element={<LayoutTest />} />
                <Route path="/hero-fraction" element={<HeroFractionRating />} />
              </>
            )}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
