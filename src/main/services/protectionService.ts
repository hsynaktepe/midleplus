import { execFile } from 'child_process';
import EventEmitter from 'events';

// Popular and high-risk VAC/Valve protected appIDs
const DEFAULT_VAC_PROTECTED_APP_IDS = new Set<number>([
  730,    // Counter-Strike 2
  440,    // Team Fortress 2
  570,    // Dota 2
  252490, // Rust
  221100, // DayZ
  218620, // PAYDAY 2
  381210, // Dead by Daylight
  550,    // Left 4 Dead 2
  10,     // Counter-Strike 1.6
  240,    // Counter-Strike: Source
  300,    // Day of Defeat: Source
]);

// Processes that indicate the user is actively gaming on their machine
const GAMING_PROCESSES = [
  'cs2.exe',
  'dota2.exe',
  'rustclient.exe',
  'valorant.exe',
  'league of legends.exe',
  'rainbowsix.exe',
  'overwatch.exe',
  'gta5.exe',
  'pubg.exe',
  'apex.exe',
  'r5apex.exe',
  'fortniteclient-win64-shipping.exe',
];

export class ProtectionService extends EventEmitter {
  private isMonitoring = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private isUserPlaying = false;
  private detectedProcessName = '';
  private vacAppIds: Set<number>;

  constructor() {
    super();
    this.vacAppIds = new Set(DEFAULT_VAC_PROTECTED_APP_IDS);
  }

  public isVacProtected(appId: number): boolean {
    return this.vacAppIds.has(appId);
  }

  public isBlacklisted(appId: number, userBlacklist: number[]): boolean {
    return userBlacklist.includes(appId) || this.isVacProtected(appId);
  }

  public startProcessMonitor(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // Check every 10 seconds for running game processes
    this.monitorInterval = setInterval(() => {
      this.checkRunningProcesses();
    }, 10000);

    // Initial check
    this.checkRunningProcesses();
  }

  public stopProcessMonitor(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
  }

  private checkRunningProcesses(): void {
    if (process.platform !== 'win32') {
      return; // Windows focus
    }

    // Run tasklist cleanly without shell popup
    execFile('tasklist.exe', ['/NH', '/FO', 'CSV'], { windowsHide: true, maxBuffer: 1024 * 1024 * 2 }, (err, stdout) => {
      if (err || !stdout) return;

      const lowerOutput = stdout.toLowerCase();
      let foundGame = '';

      for (const proc of GAMING_PROCESSES) {
        if (lowerOutput.includes(proc)) {
          foundGame = proc;
          break;
        }
      }

      if (foundGame && !this.isUserPlaying) {
        this.isUserPlaying = true;
        this.detectedProcessName = foundGame;
        this.emit('gameLaunched', foundGame);
      } else if (!foundGame && this.isUserPlaying) {
        this.isUserPlaying = false;
        this.detectedProcessName = '';
        this.emit('gameClosed');
      }
    });
  }

  public isGamingActive(): boolean {
    return this.isUserPlaying;
  }

  public getActiveGameName(): string {
    return this.detectedProcessName;
  }
}
