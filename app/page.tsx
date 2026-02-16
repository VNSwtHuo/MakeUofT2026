"use client";

import { Radar, Scan, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { esp32Service } from "@/app/esp32-intergrate";

export default function LoginScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isESP32Connected, setIsESP32Connected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [detectedUID, setDetectedUID] = useState<string | null>(null);

  useEffect(() => {
    let navigationTriggered = false; // Prevent multiple navigations

    // Check connection status periodically
    const checkConnection = () => {
      setIsESP32Connected(esp32Service.isConnected());
    };

    checkConnection();
    const interval = setInterval(checkConnection, 1000);

    // Listen for RFID scans - set up callback immediately
    const handleRFIDScan = (uid: string) => {
      // Only process if we have a valid UID and haven't already triggered navigation
      const cleanUid = uid?.trim();
      if (cleanUid && cleanUid.length >= 2 && !navigationTriggered) {
        navigationTriggered = true;
        setDetectedUID(cleanUid);

        // Store UID in sessionStorage for dashboard access
        sessionStorage.setItem("currentUserId", cleanUid);

        // Navigate to dashboard when RFID is detected
        // Use a small delay to ensure state is updated and UID is stored
        setTimeout(() => {
          router.push("/dashboard");
        }, 200);
      }
    };

    // Set up RFID callback - this must be done before connection
    esp32Service.onRFIDScan(handleRFIDScan);

    return () => {
      clearInterval(interval);
      // Clear the callback when component unmounts
      esp32Service.onRFIDScan(() => {});
    };
  }, [router]);

  const handleConnectESP32 = async () => {
    setIsConnecting(true);
    try {
      const connected = await esp32Service.connect();
      if (connected) {
        setIsESP32Connected(true);
      } else {
        alert(
          "Failed to connect to ESP32. Please make sure the device is connected and try again.",
        );
      }
    } catch (error) {
      console.error("Connection error:", error);
      alert(
        "Failed to connect to ESP32. Please grant permission and try again.",
      );
    } finally {
      setIsConnecting(false);
    }
  };

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
              Beats Per Minute
            </h1>
            <p className="text-[#A3B087] text-xl font-bold">
              Low-Visibility Ultrasonic Navigation Assistant
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

            <div className="space-y-2 text-center">
              <h2 className="text-2xl text-[#313647] font-semibold tracking-tight">
                Scan Required
              </h2>
              <p className="text-[#A3B087]">
                Please tap your RFID card on the scanner to access the system
              </p>
            </div>

            {/* ESP32 Connection Status */}
            <div className="w-full space-y-4">
              <div className="flex items-center justify-center gap-3">
                <div
                  className={`size-3 rounded-full ${isESP32Connected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
                ></div>
                <span className="text-sm font-medium text-[#313647]">
                  {isESP32Connected ? "ESP32 Connected" : "ESP32 Not Connected"}
                </span>
              </div>

              {!isESP32Connected && (
                <Button
                  onClick={handleConnectESP32}
                  disabled={isConnecting}
                  size="lg"
                  className="bg-[#435663] text-white hover:bg-[#435663]/90"
                >
                  <Usb className="mr-2 size-4" />
                  {isConnecting ? "Connecting..." : "Connect to ESP32"}
                </Button>
              )}

              {detectedUID && (
                <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg">
                  <p className="text-sm text-green-800">
                    RFID Detected: {detectedUID}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Redirecting to dashboard...
                  </p>
                </div>
              )}
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
              {isLoading ? "Loading..." : "Guest Login"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
