import React, { useState, useRef } from 'react';
import { SpatialCanvas } from './components/SpatialCanvas';
import { bleService } from './services/bleService';

export default function App() {
  const [status, setStatus] = useState("Initializing...");
  const [isConnected, setIsConnected] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const handleConnect = async () => {
    setStatus("Searching for Hub...");
    const success = await bleService.connect();
    setIsConnected(success);
    setStatus(success ? "Hub Connected" : "Connection Failed");
  };

  const handleDisconnect = () => {
    bleService.disconnect();
    setIsConnected(false);
    setStatus("Disconnected");
  };

  const handleStartRecording = async () => {
    try {
      // Request screen capture - User should select "This Tab" for best results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false
      });

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `ikea-spatial-demo-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.webm`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }, 100);
        
        setIsRecording(false);
        setStatus("Recording Saved");
      };

      recorder.start();
      setIsRecording(true);
      setStatus("Recording Active...");
      mediaRecorderRef.current = recorder;

      // Handle user stopping via browser UI
      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      };

    } catch (err) {
      console.error("Recording cancelled or failed:", err);
      setStatus("Recording Cancelled");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // Stop the stream tracks to hide the browser "sharing" banner
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div className="relative w-screen h-screen bg-white overflow-hidden font-sans select-none">
      
      {/* 3D Simulation Canvas */}
      <SpatialCanvas onStatusChange={setStatus} />

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-10 pointer-events-none">
        
        {/* Header / Brand */}
        <div className="bg-[#0058a3] shadow-lg rounded-none p-6 text-white pointer-events-auto min-w-[300px]">
          <div className="flex justify-between items-center">
             <h1 className="text-3xl font-black tracking-tighter text-[#ffdb00]">
              IKEA <span className="text-white font-normal text-lg tracking-normal ml-2">Spatial Configurator</span>
            </h1>
            {isRecording && (
              <div className="flex items-center gap-2 animate-pulse">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-xs font-bold text-red-100">REC</span>
              </div>
            )}
          </div>
         
          <div className="flex items-center gap-2 mt-4 border-t border-white/20 pt-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-[#ffdb00]' : 'bg-red-400'}`} />
            <span className="text-sm font-semibold uppercase tracking-widest">{status}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 pointer-events-auto items-end">
          <div className="bg-white border border-gray-200 shadow-xl p-4 flex flex-col gap-3 min-w-[200px]">
            {/* Connection Toggle */}
            {!isConnected ? (
              <button 
                onClick={handleConnect}
                className="w-full px-6 py-3 bg-[#0058a3] hover:bg-[#004f91] text-white text-sm font-bold uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Connect Light</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </button>
            ) : (
              <button 
                onClick={handleDisconnect}
                className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-bold uppercase tracking-wider transition-all active:scale-95"
              >
                Disconnect
              </button>
            )}

            {/* Recording Toggle */}
            {!isRecording ? (
               <button 
               onClick={handleStartRecording}
               className="w-full px-6 py-3 bg-white border-2 border-gray-100 hover:border-red-500 text-gray-700 hover:text-red-600 text-sm font-bold uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 group"
             >
               <div className="w-2 h-2 rounded-full bg-red-500 group-hover:scale-125 transition-transform" />
               <span>Record Demo</span>
             </button>
            ) : (
              <button 
              onClick={handleStopRecording}
              className="w-full px-6 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-bold uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 animate-pulse"
            >
              <div className="w-2 h-2 rounded-sm bg-white" />
              <span>Stop Recording</span>
            </button>
            )}

             <button 
              onClick={() => setShowHelp(true)}
              className="w-full px-4 py-2 bg-transparent hover:bg-gray-50 text-gray-500 text-xs font-semibold underline decoration-dotted"
            >
              Setup DIY Controller?
            </button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 bg-white/90 px-8 py-4 border border-gray-200 shadow-sm text-center pointer-events-none">
        <p className="text-[#0058a3] font-bold text-sm tracking-wide">REACH OUT TO SELECT A MOOD</p>
        <p className="text-gray-400 text-xs mt-1">Spatial Hand Tracking Active</p>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="absolute inset-0 bg-[#0058a3]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-none p-10 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative text-sm border-t-8 border-[#ffdb00]">
            <button 
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-black text-2xl font-bold"
            >
              ✕
            </button>
            <h2 className="text-3xl font-black text-[#0058a3] mb-6">Create Your Smart Hub</h2>
            
            <div className="space-y-6 text-gray-700 leading-relaxed">
              <p className="font-medium text-lg">To simulate the TRÅDFRI experience, you can build a simple DIY controller using an ESP32 microcontroller.</p>
              
              <section className="bg-gray-50 p-6 border border-gray-100">
                <h3 className="text-lg font-bold text-black mb-2 flex items-center gap-2">
                   <span className="bg-[#0058a3] text-white w-6 h-6 flex items-center justify-center rounded-full text-xs">1</span>
                   Required Parts
                </h3>
                <ul className="list-disc list-inside ml-2 space-y-1 text-gray-600">
                  <li>ESP32 Development Board</li>
                  <li>Addressable LED Strip (WS2812B)</li>
                  <li>Micro-USB Cable</li>
                </ul>
              </section>

              <section>
                 <h3 className="text-lg font-bold text-black mb-2 flex items-center gap-2">
                   <span className="bg-[#0058a3] text-white w-6 h-6 flex items-center justify-center rounded-full text-xs">2</span>
                   Flash Firmware
                </h3>
                <p className="mb-4 text-gray-500">Upload this code using Arduino IDE. It converts BLE commands from this app into lighting signals.</p>
                <div className="bg-gray-900 rounded p-4 font-mono text-xs text-yellow-400 overflow-x-auto border border-gray-800 shadow-inner">
<pre>{`#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <FastLED.h> 

#define LED_PIN     5      
#define NUM_LEDS    16     
#define LED_TYPE    WS2812B
#define COLOR_ORDER GRB

CRGB leds[NUM_LEDS];
#define SERVICE_UUID           "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_RX "6e400002-b5a3-f393-e0a9-e50e24dcca9e"

BLECharacteristic *pCharacteristic;

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string rxValue = pCharacteristic->getValue();
      if (rxValue.length() > 0) {
        int r, g, b;
        if (sscanf(rxValue.c_str(), "%d,%d,%d", &r, &g, &b) == 3) {
            fill_solid(leds, NUM_LEDS, CRGB(r, g, b));
            FastLED.show();
        }
      }
    }
};

void setup() {
  Serial.begin(115200);
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(100);
  
  BLEDevice::init("IKEA_Simulator");
  BLEServer *pServer = BLEDevice::createServer();
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_RX, BLECharacteristic::PROPERTY_WRITE);
  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();
  
  BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
}

void loop() { delay(100); }`}</pre>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}