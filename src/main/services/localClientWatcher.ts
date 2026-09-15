import { execFile } from 'child_process';
import EventEmitter from 'events';

export class LocalClientWatcher extends EventEmitter {
  private isSteamRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private activeSimulatedAppId: number | null = null;

  constructor() {
    super();
  }

  public start(): void {
    if (this.checkInterval) return;
    this.checkSteamProcess();
    this.checkInterval = setInterval(() => {
      this.checkSteamProcess();
    }, 8000);
  }

  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.stopLocalSimulation();
  }

  public checkSteamProcess(): Promise<boolean> {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        this.isSteamRunning = false;
        resolve(false);
        return;
      }

      execFile(
        'tasklist.exe',
        ['/FI', 'IMAGENAME eq steam.exe', '/NH', '/FO', 'CSV'],
        { windowsHide: true, maxBuffer: 1024 * 512 },
        (err, stdout) => {
          const running = !err && stdout && stdout.toLowerCase().includes('steam.exe');
          if (running !== this.isSteamRunning) {
            this.isSteamRunning = Boolean(running);
            this.emit('clientStatusChanged', this.isSteamRunning);
          }
          resolve(this.isSteamRunning);
        }
      );
    });
  }

  public simulatePlayingGame(appId: number): void {
    this.activeSimulatedAppId = appId;
    this.emit('localGameSimulated', appId);
  }

  public stopLocalSimulation(): void {
    if (this.activeSimulatedAppId !== null) {
      const prev = this.activeSimulatedAppId;
      this.activeSimulatedAppId = null;
      this.emit('localGameSimulationStopped', prev);
    }
  }

  public getIsSteamRunning(): boolean {
    return this.isSteamRunning;
  }

  public getActiveSimulatedAppId(): number | null {
    return this.activeSimulatedAppId;
  }
}
