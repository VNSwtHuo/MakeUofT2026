"use client";

import { Radar, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleDemoLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      router.push("/dashboard");
    }, 1000);
  };
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl text-center space-y-8">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full"></div>
              <div className="relative bg-[#A3B087] p-8 rounded-full">
                <Radar className="size-20 text-primary-foreground" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-[#313647] text-5xl font-bold tracking-tight">
              Radar Navigation System
            </h1>
            <p className="text-[#A3B087] text-xl font-bold">
              Low-Visibility Navigation Assistant for Tactical Operations
            </p>
          </div>
        </div>

        <div className="bg-[#A3B087]/15 border-2 border-dashed border-[#A3B087] rounded-xl p-12 shadow-lg">
          <div className="flex flex-col items-center gap-6 ">
            <div className="relative">
              <div className="absolute inset-0 bg-secondary/30 blur-2xl rounded-full animate-pulse"></div>
              <Scan
                className="relative size-24 text-[#A3B087]"
                strokeWidth={1.5}
              />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl text-[#313647] font-semibold tracking-tight">
                Scan Required
              </h2>
              <p className="text-[#A3B087]">
                Please tap your RFID card on the scanner to access the system
              </p>
            </div>
          </div>
        </div>

        <div className="pt-6">
          <div className="inline-flex flex-col items-center gap-3">
            <span className="text-sm text-muted-foreground">Demo Mode</span>
            <Button
              onClick={handleDemoLogin}
              disabled={isLoading}
              size="lg"
              variant="outline"
              className="bg-[#435663] text-white hover:bg-[#435663]/90 hover:text-white"
            >
              {isLoading ? "Scanning..." : "Guest - Simulate RFID Scan"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
