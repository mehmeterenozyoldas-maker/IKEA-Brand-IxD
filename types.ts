export interface Point {
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
}

export enum OrbState {
  IDLE,
  HOVER,
  ACTIVATING,
  ACTIVE
}

export interface Orb {
  id: string;
  x: number;
  y: number;
  radius: number;
  baseRadius: number;
  color: Color;
  state: OrbState;
  pulseOffset: number;
  label: string;
}

export enum ParticleType {
  SPARK, // Fast, gravity, trails
  GLOW,  // Soft, rising
  CORE,  // The 'energy' transferring to hand
}

export interface Particle {
  x: number;
  y: number;
  vx: number; 
  vy: number;
  life: number;     // 0.0 to 1.0
  decay: number;    // How fast life decreases
  color: Color;
  size: number;
  type: ParticleType;
  // Physics props
  gravity?: number;
  friction?: number;
  wobble?: number;  // Sine wave offset
  target?: Point;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  color: Color;
}

export interface HandData {
  x: number; 
  y: number; 
  detected: boolean;
  history: Point[]; // For trails
}