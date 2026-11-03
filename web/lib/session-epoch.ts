export class SessionEpoch {
  private value = 0;
  snapshot(): number { return this.value; }
  invalidate(): void { this.value++; }
  current(snapshot: number): boolean { return this.value === snapshot; }
}
