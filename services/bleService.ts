/**
 * Standard Nordic UART Service UUIDs commonly used for ESP32/Arduino BLE projects.
 * You may need to change these if your ESP32 uses different UUIDs.
 */
const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; 

// Web Bluetooth Type Definitions
interface BluetoothRemoteGATTCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  gatt?: BluetoothRemoteGATTServer;
}

export class BLEService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  async connect(): Promise<boolean> {
    try {
      console.log('Requesting Bluetooth Device...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (!nav.bluetooth) {
        console.error('Web Bluetooth is not supported in this browser.');
        return false;
      }

      this.device = await nav.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID] 
      });

      if (!this.device) return false;

      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);

      console.log('Connecting to GATT Server...');
      this.server = await this.device.gatt?.connect() || null;

      if (!this.server) return false;

      console.log('Getting Service...');
      const service = await this.server.getPrimaryService(SERVICE_UUID);

      console.log('Getting Characteristic...');
      this.characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID_TX);

      return true;
    } catch (error) {
      console.error('BLE Connection Failed:', error);
      return false;
    }
  }

  disconnect() {
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }

  onDisconnected = () => {
    console.log('Device disconnected');
    this.device = null;
    this.server = null;
    this.characteristic = null;
  };

  async sendColor(r: number, g: number, b: number) {
    if (!this.characteristic) return;

    // Format: "255,0,0\n"
    const dataString = `${Math.floor(r)},${Math.floor(g)},${Math.floor(b)}\n`;
    const encoder = new TextEncoder();
    const value = encoder.encode(dataString);

    try {
      await this.characteristic.writeValue(value);
      console.log('Sent color:', dataString.trim());
    } catch (error) {
      console.error('Failed to send BLE data', error);
    }
  }

  isConnected(): boolean {
    return !!(this.device && this.device.gatt?.connected && this.characteristic);
  }
}

export const bleService = new BLEService();