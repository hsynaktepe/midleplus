import EventEmitter from 'events';

export class AdaptivePoller extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private isRateLimited = false;
  private rateLimitRemainingSeconds = 0;
  private nextCheckSecondsRemaining = 0;
  private currentIntervalMinutes = 15;

  constructor() {
    super();
    this.startSecondTicker();
  }

  private startSecondTicker(): void {
    this.tickInterval = setInterval(() => {
      if (this.isRateLimited) {
        if (this.rateLimitRemainingSeconds > 0) {
          this.rateLimitRemainingSeconds--;
          this.emit('rateLimitTick', this.rateLimitRemainingSeconds);
        } else {
          this.isRateLimited = false;
          this.emit('rateLimitCleared');
        }
      }

      if (this.nextCheckSecondsRemaining > 0) {
        this.nextCheckSecondsRemaining--;
        this.emit('tick', this.nextCheckSecondsRemaining);
      }
    }, 1000);
  }

  public scheduleNextCheck(cardsRemainingInActiveGame: number, multiMinutes = 15, soloMinutes = 5): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.isRateLimited) {
      return; // Do not schedule normal checks while rate limited
    }

    // If only 1 card remains, poll more frequently (5 min); otherwise, 15 min
    this.currentIntervalMinutes = cardsRemainingInActiveGame <= 1 ? soloMinutes : multiMinutes;
    this.nextCheckSecondsRemaining = this.currentIntervalMinutes * 60;

    this.timer = setTimeout(() => {
      this.emit('checkDue');
    }, this.currentIntervalMinutes * 60 * 1000);
  }

  public triggerRateLimit(cooldownMinutes = 15): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.isRateLimited = true;
    this.rateLimitRemainingSeconds = cooldownMinutes * 60;
    this.emit('rateLimited', this.rateLimitRemainingSeconds);
  }

  public reset(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextCheckSecondsRemaining = 0;
    this.isRateLimited = false;
    this.rateLimitRemainingSeconds = 0;
  }

  public destroy(): void {
    this.reset();
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  public getRateLimitSeconds(): number {
    return this.rateLimitRemainingSeconds;
  }

  public getNextCheckSeconds(): number {
    return this.nextCheckSecondsRemaining;
  }

  public isLimited(): boolean {
    return this.isRateLimited;
  }
}
