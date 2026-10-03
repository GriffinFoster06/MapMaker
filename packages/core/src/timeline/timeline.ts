// Timeline (ARCHITECTURE §3.4): a history axis with a dtYears era schedule, and an optional geologic axis in Myr.
// Original shell code.

export interface Era { fromTick: number; dtYears: number }

export interface Calendar {
  epoch: string;
  yearLengthDays: number;
  monthLengthsDays: number[];
}

export interface GeoAxis { tStartMyr: number; dtMyr: number; keyframeEveryMyr: number }

export interface TimelineJSON {
  calendar: Calendar;
  tick: number;
  eras: Era[];
  geo?: GeoAxis;
  geoStep: number;
}

export class Timeline {
  tick = 0;
  /** Current geologic step (0 = tStartMyr). */
  geoStep = 0;
  readonly eras: Era[];

  constructor(readonly calendar: Calendar, eras: Era[] = [{ fromTick: 0, dtYears: 1 }], readonly geo?: GeoAxis) {
    if (!eras.length || eras[0]!.fromTick !== 0) throw new Error('first era must start at tick 0');
    for (let i = 0; i < eras.length; i++) {
      if (!(eras[i]!.dtYears > 0)) throw new Error('dtYears must be positive');
      if (i && eras[i]!.fromTick <= eras[i - 1]!.fromTick) throw new Error('eras must be strictly increasing');
    }
    this.eras = eras.map((e) => ({ ...e }));
  }

  /** Years covered by the tick that starts at `tick`. Stages read this and never assume one year. */
  dtAt(tick: number): number {
    let dt = this.eras[0]!.dtYears;
    for (const e of this.eras) if (e.fromTick <= tick) dt = e.dtYears; else break;
    return dt;
  }

  /** Elapsed simulation years at the start of `tick`. */
  simTimeAt(tick: number): number {
    let years = 0;
    for (let i = 0; i < this.eras.length; i++) {
      const from = this.eras[i]!.fromTick;
      if (tick <= from) break;
      const to = i + 1 < this.eras.length ? Math.min(tick, this.eras[i + 1]!.fromTick) : tick;
      years += (to - from) * this.eras[i]!.dtYears;
    }
    return years;
  }

  get simTime(): number { return this.simTimeAt(this.tick); }

  /** Geologic time in Myr (negative before present) at a geo step. */
  geoTimeMyr(step: number): number {
    if (!this.geo) throw new Error('no geologic axis');
    return this.geo.tStartMyr + step * this.geo.dtMyr;
  }

  /** Keyframe interval on the geologic axis, in steps. */
  get geoKeyframeEverySteps(): number {
    if (!this.geo) throw new Error('no geologic axis');
    return Math.max(1, Math.round(this.geo.keyframeEveryMyr / this.geo.dtMyr));
  }

  toJSON(): TimelineJSON {
    const j: TimelineJSON = { calendar: this.calendar, tick: this.tick, eras: this.eras, geoStep: this.geoStep };
    if (this.geo) j.geo = this.geo;
    return j;
  }

  static fromJSON(j: TimelineJSON): Timeline {
    const t = new Timeline(j.calendar, j.eras, j.geo);
    t.tick = j.tick; t.geoStep = j.geoStep;
    return t;
  }
}
