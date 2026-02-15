import { useState, useEffect } from "react";
import { SettingsPanel } from "./settings-panel";
import { RadarDisplay } from "./radar-display";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Wifi, WifiOff } from "lucide-react";
import { esp32Service } from "./esp32-service";
import { toast } from "sonner";

interface DistanceZone {
  distance: number;
  soundFont: string;
  customSound: string | null;
  aiVoicePrompt: string;
}

interface UserSettings {
  id: string;
  name: string;
  visionRange: number;
  distanceZones: DistanceZone[];
}

interface DashboardProps {
  user: UserSettings;
  onSave: (settings: UserSettings) => void;
  onLogout: () => void;
}

export function Dashboard({ user, onSave, onLogout }: DashboardProps) {
  const [isESP32Connected, setIsESP32Connected] = useState(false);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [detectedObjects, setDetectedObjects] = useState<
    Array<{ angle: number; distance: number }>
  >([]);
  const [simulationMode, setSimulationMode] = useState(true);

  // Simulation mode - for demo without ESP32
  useEffect(() => {
    if (!simulationMode) return;

    const interval = setInterval(() => {
      setCurrentAngle((prev) => (prev + 2) % user.visionRange);

      // Randomly detect objects for demo
      if (Math.random() > 0.96) {
        const newObject = {
          angle: Math.random() * user.visionRange,
          distance: Math.random() * 150 + 20,
        };
        setDetectedObjects((prev) => [...prev, newObject].slice(-30));
      }
    }, 50);

    return () => clearInterval(interval);
  }, [simulationMode, user.visionRange]);

  // ESP32 Connection
  const handleConnectESP32 = async () => {
    const connected = await esp32Service.connect();
    if (connected) {
      setIsESP32Connected(true);
      setSimulationMode(false);
      toast.success("ESP32 Connected", {
        description: "Serial communication established",
      });

      // Set up data callbacks
      esp32Service.onRadarData((angle, distance) => {
        setCurrentAngle(angle);
        if (distance < 200) {
          setDetectedObjects((prev) =>
            [...prev, { angle, distance }].slice(-30),
          );
        }
      });

      // Send current settings
      await esp32Service.sendSettings({
        visionRange: user.visionRange,
        distanceZones: user.distanceZones,
      });
    } else {
      toast.error("Connection Failed", {
        description: "Could not connect to ESP32",
      });
    }
  };

  const handleDisconnectESP32 = async () => {
    await esp32Service.disconnect();
    setIsESP32Connected(false);
    setSimulationMode(true);
    toast.info("ESP32 Disconnected");
  };

  const handleSave = async (settings: UserSettings) => {
    onSave(settings);

    // Send to ESP32 if connected
    if (isESP32Connected) {
      await esp32Service.sendSettings({
        visionRange: settings.visionRange,
        distanceZones: settings.distanceZones,
      });
    }
  };

  return (
    <div className="min-h-screen">
      <div className="grid lg:grid-cols-[1fr,500px] gap-0 min-h-screen">
        {/* Settings Panel */}
        <div className="p-6 lg:p-8">
          <SettingsPanel
            user={user}
            onSave={handleSave}
            onLogout={onLogout}
            isESP32Connected={isESP32Connected}
          />
        </div>

        {/* Radar Display Sidebar */}
        <div className="bg-card border-l border-border p-6 flex flex-col gap-6">
          {/* ESP32 Connection */}
          <Card>
            <CardHeader>
              <CardTitle>Hardware Connection</CardTitle>
              <CardDescription>Connect to ESP32 via USB</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isESP32Connected ? (
                <>
                  <Button onClick={handleConnectESP32} className="w-full">
                    <Wifi className="size-4 mr-2" />
                    Connect ESP32
                  </Button>
                  <Badge
                    variant="secondary"
                    className="w-full justify-center py-2"
                  >
                    Simulation Mode Active
                  </Badge>
                </>
              ) : (
                <Button
                  onClick={handleDisconnectESP32}
                  variant="outline"
                  className="w-full"
                >
                  <WifiOff className="size-4 mr-2" />
                  Disconnect
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Radar Display */}
          <Card className="flex-1 flex flex-col">
            <CardHeader>
              <CardTitle>Radar View</CardTitle>
              <CardDescription>Live obstacle detection</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center justify-center">
              <RadarDisplay
                visionRange={user.visionRange}
                detectedObjects={detectedObjects}
                currentAngle={currentAngle}
              />
              <div className="mt-4 text-center space-y-1">
                <div className="text-sm text-muted-foreground">
                  Angle: {currentAngle}° | Range: {user.visionRange}°
                </div>
                <div className="text-xs text-muted-foreground">
                  Objects Detected: {detectedObjects.length}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Zone Status */}
          <Card>
            <CardHeader>
              <CardTitle>Detection Zones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {user.distanceZones.map((zone, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    Zone {index + 1}:
                  </span>
                  <Badge variant="outline">
                    {zone.distance}cm • {zone.soundFont}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
