import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { bleService } from '../services/bleService';
import { Orb, OrbState, Particle, ParticleType, HandData, Shockwave, Color } from '../types';

interface SpatialCanvasProps {
  onStatusChange: (status: string) => void;
}

const ACTIVATE_RADIUS = 80;
const HOVER_RADIUS = 160;

// Colors
const IKEA_BLUE = { r: 0, g: 88, b: 163 };
const IKEA_YELLOW = { r: 255, g: 219, b: 0 };
const PURE_WHITE = { r: 255, g: 255, b: 255 };

export const SpatialCanvas: React.FC<SpatialCanvasProps> = ({ onStatusChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  
  // Simulation State
  const orbsRef = useRef<Orb[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const handPosRef = useRef<HandData>({ x: 0, y: 0, detected: false, history: [] });
  const lastBleSendRef = useRef<number>(0);

  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const init = async () => {
      onStatusChange("Initializing Reality Engine...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });

      onStatusChange("Waiting for Camera Feed...");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720, facingMode: "user" } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadeddata', () => {
            setIsLoaded(true);
            onStatusChange("Ready");
            spawnConfigNodes(videoRef.current!.videoWidth, videoRef.current!.videoHeight);
            startLoop();
          });
        }
      } catch (err) {
        onStatusChange("Error: " + err);
      }
    };

    init();
    
    return () => {
      cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const spawnConfigNodes = (width: number, height: number) => {
    const configs = [
      { label: "RELAX", color: { r: 255, g: 160, b: 60 }, x: width * 0.2, y: height * 0.3 }, 
      { label: "FOCUS", color: { r: 200, g: 230, b: 255 }, x: width * 0.8, y: height * 0.3 }, 
      { label: "CINEMA", color: { r: 120, g: 40, b: 255 }, x: width * 0.2, y: height * 0.7 }, 
      { label: "ACTIVE", color: { r: 255, g: 220, b: 0 }, x: width * 0.8, y: height * 0.7 }, 
    ];

    orbsRef.current = configs.map((cfg, idx) => ({
      id: `node-${idx}`,
      x: cfg.x,
      y: cfg.y,
      radius: 50,
      baseRadius: 50,
      color: cfg.color,
      state: OrbState.IDLE,
      pulseOffset: Math.random() * 1000,
      label: cfg.label
    }));
  };

  // --- VFX GENERATORS ---

  const spawnExplosion = (x: number, y: number, color: Color) => {
    // 1. Core Shockwave
    shockwavesRef.current.push({
      x, y, radius: 10, maxRadius: 200, life: 1.0, color
    });

    // 2. High velocity sparks (The "Snap")
    for (let i = 0; i < 40; i++) {
      const angle = (Math.PI * 2 * i) / 40;
      const speed = Math.random() * 15 + 5;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: Math.random() * 0.03 + 0.01,
        color: PURE_WHITE, // Sparks are hot white initially
        size: Math.random() * 3 + 1,
        type: ParticleType.SPARK,
        friction: 0.92,
        gravity: 0.5
      });
    }

    // 3. Floating Glows (The "Atmosphere")
    for (let i = 0; i < 20; i++) {
      particlesRef.current.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2 - 2, // Float up
        life: 1.0,
        decay: Math.random() * 0.01 + 0.005,
        color: color,
        size: Math.random() * 30 + 10,
        type: ParticleType.GLOW,
        friction: 0.98,
        wobble: Math.random() * 0.1
      });
    }
  };

  const spawnTransferStream = (source: Orb, targetX: number, targetY: number) => {
    // Particles that flow from Orb to Hand
    for (let i = 0; i < 2; i++) {
      particlesRef.current.push({
        x: source.x + (Math.random() - 0.5) * source.radius,
        y: source.y + (Math.random() - 0.5) * source.radius,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 1.0,
        decay: 0.02,
        color: source.color,
        size: Math.random() * 4 + 2,
        type: ParticleType.CORE,
        target: { x: targetX, y: targetY }
      });
    }
  };

  // --- RENDERERS ---

  const drawHandTrail = (ctx: CanvasRenderingContext2D, history: {x:number, y:number}[]) => {
    if (history.length < 2) return;

    // Smooth spline
    ctx.beginPath();
    ctx.moveTo(history[0].x, history[0].y);
    for (let i = 1; i < history.length - 1; i++) {
      const xc = (history[i].x + history[i+1].x) / 2;
      const yc = (history[i].y + history[i+1].y) / 2;
      ctx.quadraticCurveTo(history[i].x, history[i].y, xc, yc);
    }
    ctx.lineTo(history[history.length - 1].x, history[history.length - 1].y);

    // Glowing style
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 20;
    ctx.shadowColor = `rgb(${IKEA_YELLOW.r}, ${IKEA_YELLOW.g}, ${IKEA_YELLOW.b})`;
    ctx.strokeStyle = `rgba(${IKEA_YELLOW.r}, ${IKEA_YELLOW.g}, ${IKEA_YELLOW.b}, 0.8)`;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset
  };

  const drawOrb = (ctx: CanvasRenderingContext2D, orb: Orb, time: number) => {
    // 1. Pulse Effect
    const pulse = Math.sin((time + orb.pulseOffset) * 0.003); // -1 to 1
    const sizeMultiplier = orb.state === OrbState.HOVER ? 1.2 : 1.0;
    const currentRadius = orb.radius * sizeMultiplier + (pulse * 2);

    // 2. Core Glow (Additive)
    const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, currentRadius * 1.5);
    gradient.addColorStop(0, `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, 0.8)`);
    gradient.addColorStop(0.5, `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, 0.2)`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, currentRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 3. Solid Center
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, currentRadius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();

    // 4. Rotating HUD Rings
    ctx.strokeStyle = `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, 0.8)`;
    ctx.lineWidth = 2;
    
    // Ring 1: Slow rotation
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, currentRadius, time * 0.001, time * 0.001 + Math.PI * 1.5);
    ctx.stroke();

    // Ring 2: Fast counter-rotation, dashed
    if (orb.state === OrbState.HOVER || orb.state === OrbState.ACTIVATING) {
        ctx.beginPath();
        ctx.setLineDash([5, 10]);
        ctx.arc(orb.x, orb.y, currentRadius + 12, -time * 0.003, -time * 0.003 + Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 5. Label - MIRRORED FIX
    ctx.save();
    ctx.translate(orb.x, orb.y);
    ctx.scale(-1, 1);
    ctx.font = "700 12px 'Noto Sans'";
    ctx.textAlign = "center";
    
    // Label Box
    const textW = ctx.measureText(orb.label).width + 20;
    ctx.fillStyle = `rgba(0,0,0,0.8)`;
    if (orb.state === OrbState.ACTIVE) ctx.fillStyle = `rgb(${IKEA_BLUE.r},${IKEA_BLUE.g},${IKEA_BLUE.b})`;
    
    ctx.fillRect(-textW/2, currentRadius + 15, textW, 24);
    
    // Text
    ctx.fillStyle = "#FFF";
    ctx.fillText(orb.label, 0, currentRadius + 31);
    ctx.restore();
  };

  const drawShockwave = (ctx: CanvasRenderingContext2D, wave: Shockwave) => {
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${wave.color.r}, ${wave.color.g}, ${wave.color.b}, ${wave.life})`;
    ctx.lineWidth = 10 * wave.life;
    ctx.stroke();
  };

  // --- MAIN LOOP ---

  const updatePhysics = (width: number, height: number) => {
    // 1. Shockwaves
    for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
        const wave = shockwavesRef.current[i];
        wave.radius += (wave.maxRadius - wave.radius) * 0.1; // Ease out expansion
        wave.life -= 0.04;
        if (wave.life <= 0) shockwavesRef.current.splice(i, 1);
    }

    // 2. Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.life -= p.decay;

        if (p.life <= 0) {
            particlesRef.current.splice(i, 1);
            continue;
        }

        // Logic based on type
        if (p.type === ParticleType.SPARK) {
            p.vx *= p.friction || 1;
            p.vy *= p.friction || 1;
            p.vy += p.gravity || 0;
            p.x += p.vx;
            p.y += p.vy;
        } 
        else if (p.type === ParticleType.GLOW) {
            p.y += p.vy;
            if (p.wobble) p.x += Math.sin(Date.now() * 0.005) * p.wobble;
        }
        else if (p.type === ParticleType.CORE && p.target) {
            // Homing Missile Logic
            const dx = p.target.x - p.x;
            const dy = p.target.y - p.y;
            p.x += dx * 0.15; // Fast lerp
            p.y += dy * 0.15;
            
            // Jitter
            p.x += (Math.random() - 0.5) * 5;
            p.y += (Math.random() - 0.5) * 5;
        }
    }
  };

  const startLoop = () => {
    let lastTime = 0;

    const loop = (time: number) => {
      if (!videoRef.current || !canvasRef.current || !handLandmarkerRef.current) {
        requestRef.current = requestAnimationFrame(loop);
        return;
      }

      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // --- DETECTION ---
      if (time - lastTime > 30) {
        const detections = handLandmarkerRef.current.detectForVideo(video, time);
        if (detections.landmarks.length > 0) {
          const indexFinger = detections.landmarks[0][8]; 
          const hx = indexFinger.x * canvas.width;
          const hy = indexFinger.y * canvas.height;
          
          handPosRef.current.detected = true;
          handPosRef.current.x = hx;
          handPosRef.current.y = hy;
          
          // Add to history for trails
          handPosRef.current.history.push({x: hx, y: hy});
          if (handPosRef.current.history.length > 15) handPosRef.current.history.shift();

        } else {
          handPosRef.current.detected = false;
          // Slowly clear history
          if (handPosRef.current.history.length > 0) handPosRef.current.history.shift();
        }
        lastTime = time;
      }

      // --- LOGIC ---
      updatePhysics(canvas.width, canvas.height);
      const hand = handPosRef.current;

      orbsRef.current.forEach(orb => {
        let dist = 10000;
        if (hand.detected) {
          const dx = hand.x - orb.x;
          const dy = hand.y - orb.y;
          dist = Math.sqrt(dx * dx + dy * dy);
        }

        if (dist < ACTIVATE_RADIUS) {
            if (orb.state !== OrbState.ACTIVE) {
                orb.state = OrbState.ACTIVATING;
            }
            
            // Stream particles to hand while hovering
            spawnTransferStream(orb, hand.x, hand.y);

            // Throttle BLE and Explosion
            if (time - lastBleSendRef.current > 1000) { // 1 second debounce for major actions
                bleService.sendColor(orb.color.r, orb.color.g, orb.color.b);
                lastBleSendRef.current = time;
                
                orb.state = OrbState.ACTIVE;
                spawnExplosion(orb.x, orb.y, orb.color);
                
                // Reset others
                orbsRef.current.forEach(o => { if (o.id !== orb.id) o.state = OrbState.IDLE; });
            }
        } else if (dist < HOVER_RADIUS) {
            orb.state = OrbState.HOVER;
        } else if (orb.state !== OrbState.ACTIVE) {
            orb.state = OrbState.IDLE;
        }
      });

      // --- DRAWING ---
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Enable Additive Blending for VFX
      ctx.globalCompositeOperation = 'lighter';

      // Draw Shockwaves
      shockwavesRef.current.forEach(w => drawShockwave(ctx, w));

      // Draw Particles
      particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Extra glow for sparks
        if (p.type === ParticleType.SPARK) {
            ctx.shadowColor = `rgb(${p.color.r},${p.color.g},${p.color.b})`;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
      });
      
      // Draw Hand Trail
      if (hand.detected) drawHandTrail(ctx, hand.history);

      // Reset Composite for Orbs/Text to ensure readability
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;

      orbsRef.current.forEach(orb => drawOrb(ctx, orb, time));

      // Draw Hand Cursor
      if (hand.detected) {
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#FFF";
        ctx.fill();
        ctx.strokeStyle = `rgb(${IKEA_YELLOW.r},${IKEA_YELLOW.g},${IKEA_YELLOW.b})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
      {/* Hidden Video Source */}
      <video 
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover opacity-30 mirror-mode grayscale" 
        autoPlay 
        playsInline 
        muted
        style={{ transform: 'scaleX(-1)' }} 
      />
      
      {/* Simulation Layer */}
      <canvas 
        ref={canvasRef}
        width={1280}
        height={720}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{ transform: 'scaleX(-1)' }} // Mirror effect
      />

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-50">
          <div className="text-[#0058a3] font-bold text-xl animate-bounce">Initializing Reality Engine...</div>
        </div>
      )}
    </div>
  );
};