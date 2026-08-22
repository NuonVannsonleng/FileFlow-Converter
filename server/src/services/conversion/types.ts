import type { Category, ConversionSettings, Engine } from '@shared';

export interface ConversionContext {
  /** Absolute path to the validated source file. */
  inputPath: string;
  /** Absolute path the handler must write its result to. */
  outputPath: string;
  /** Scratch directory unique to this job; removed after the job settles. */
  workDir: string;
  from: string;
  to: string;
  originalName: string;
  settings: ConversionSettings;
  /** Report 0-100 completion. Handlers that cannot measure progress may skip it. */
  onProgress: (percent: number) => void;
  /**
   * Override the download filename. Only needed when the handler discovers the
   * real name during the conversion, e.g. unpacking a single-file archive.
   */
  setOutputName: (name: string) => void;
}

export type ConversionHandler = (ctx: ConversionContext) => Promise<void>;

export interface ConversionDefinition {
  from: string;
  to: string;
  category: Category;
  engine: Engine;
  /** Surfaced in the UI as a caveat, e.g. "Text content only". */
  note?: string;
  handler: ConversionHandler;
}
