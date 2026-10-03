export type RngAlgo = 'orogen-lcg' | 'alea' | 'sfc32';

export interface SerializedStream {
  name: string;
  algo: RngAlgo;
  state: number[];
  draws: number;
}

export interface RngStream {
  readonly name: string;
  readonly algo: RngAlgo;
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform uint32 (algorithm-specific mapping). */
  uint32(): number;
  readonly draws: number;
  serialize(): SerializedStream;
}
