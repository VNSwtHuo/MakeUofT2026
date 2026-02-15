import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Save, LogOut, Waves } from "lucide-react";
import soundsData from "../../data/sound.json";

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

interface SettingsPanelProps {
  user: UserSettings;
  onSave: (settings: UserSettings) => void;
  onLogout: () => void;
  isESP32Connected: boolean;
}

export function SettingsPanel({
  user,
  onSave,
  onLogout,
  isESP32Connected,
}: SettingsPanelProps) {
  const [settings, setSettings] = useState<UserSettings>(user);

  const updateZone = (index: number, updates: Partial<DistanceZone>) => {
    const newZones = [...settings.distanceZones];
    newZones[index] = { ...newZones[index], ...updates };
    setSettings({ ...settings, distanceZones: newZones });
  };

  const handleFileUpload = (index: number, file: File | null) => {
    if (file) {
      updateZone(index, { customSound: file.name });
    }
  };

  const handleSave = () => {
    onSave(settings);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl">Ultrasonic Configuration</h1>
          <p className="text-muted-foreground">
            User: {user.name} • ID: {user.id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div
              className={`size-2 rounded-full ${isESP32Connected ? "bg-secondary animate-pulse" : "bg-muted"}`}
            ></div>
            <span className="text-muted-foreground">
              {isESP32Connected ? "ESP32 Connected" : "Not Connected"}
            </span>
          </div>
          <Button onClick={onLogout} variant="outline">
            <LogOut className="size-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Vision Range */}
      <Card>
        <CardHeader>
          <CardTitle>Vision Range</CardTitle>
          <CardDescription>Set the servo motor scanning angle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Servo Angle</Label>
            <span className="text-lg font-medium">{settings.visionRange}°</span>
          </div>
          <Slider
            value={[settings.visionRange]}
            onValueChange={(value) =>
              setSettings({ ...settings, visionRange: value[0] })
            }
            min={30}
            max={270}
            step={10}
            className="w-full"
          />
        </CardContent>
      </Card>

      {/* Distance Zones */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl">Detection Zones</h2>
          <p className="text-sm text-muted-foreground">
            Configure up to 3 distance zones with different alerts
          </p>
        </div>

        {settings.distanceZones.map((zone, index) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Waves className="size-5 text-secondary" />
                <CardTitle>Zone {index + 1}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Distance Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Alert Distance</Label>
                  <span className="text-lg font-medium">
                    {zone.distance} cm
                  </span>
                </div>
                <Slider
                  value={[zone.distance]}
                  onValueChange={(value) =>
                    updateZone(index, { distance: value[0] })
                  }
                  min={10}
                  max={200}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Sound Selection */}
              <div className="space-y-3">
                <Label>Alert Sound</Label>
                <Tabs defaultValue="preloaded" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="preloaded">Preloaded</TabsTrigger>
                    <TabsTrigger value="ai">AI Voice</TabsTrigger>
                    <TabsTrigger value="custom">Custom</TabsTrigger>
                  </TabsList>

                  <TabsContent value="preloaded" className="space-y-3">
                    <RadioGroup
                      value={zone.soundFont}
                      onValueChange={(value) =>
                        updateZone(index, { soundFont: value })
                      }
                    >
                      {soundsData.preloadedSounds.map((sound) => (
                        <div
                          key={sound.id}
                          className="flex items-center space-x-2"
                        >
                          <RadioGroupItem
                            value={sound.id}
                            id={`${sound.id}-${index}`}
                          />
                          <Label htmlFor={`${sound.id}-${index}`}>
                            {sound.name}
                            <span className="text-xs text-muted-foreground ml-2">
                              {sound.description}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </TabsContent>

                  <TabsContent value="ai" className="space-y-3">
                    <Textarea
                      placeholder="Enter text for AI voice (e.g., 'Obstacle at 30cm')"
                      value={zone.aiVoicePrompt}
                      onChange={(e) =>
                        updateZone(index, { aiVoicePrompt: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      ElevenLabs API to be integrated manually
                    </p>
                  </TabsContent>

                  <TabsContent value="custom" className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="audio/*"
                        onChange={(e) =>
                          handleFileUpload(index, e.target.files?.[0] || null)
                        }
                      />
                      <Button type="button" variant="outline" size="icon">
                        <Upload className="size-4" />
                      </Button>
                    </div>
                    {zone.customSound && (
                      <p className="text-xs text-secondary">
                        Uploaded: {zone.customSound}
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Save Button */}
      <Button onClick={handleSave} size="lg" className="w-full">
        <Save className="size-4 mr-2" />
        Save & Load to ESP32
      </Button>
    </div>
  );
}
