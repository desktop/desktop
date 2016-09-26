export class Stats {
  public launchTime: number
  public readyTime: number

  public constructor() {
    this.launchTime = Date.now()
  }
}
