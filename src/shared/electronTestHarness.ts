export interface ElectronTestInputSample {
  sequence: number;
  modifierDown: boolean;
  primaryDown: boolean;
  cursor: { x: number; y: number };
  capturedAt: number;
}

export const ELECTRON_TEST_CHANNELS = {
  GET_CONFIG: 'markuprx:e2e:get-config',
  INJECT_INPUT: 'markuprx:e2e:inject-input',
  SET_INPUT_AVAILABLE: 'markuprx:e2e:set-input-available',
  INJECT_TRANSCRIPT: 'markuprx:e2e:inject-transcript',
  GET_DIAGNOSTICS: 'markuprx:e2e:get-diagnostics',
} as const;

export interface ElectronTestConfig {
  enabled: true;
  outputRoot: string;
  localTranscriptionRecovery: boolean;
  video: {
    width: number;
    height: number;
    frameRate: number;
  };
}

export interface ElectronTestDiagnostics {
  state: string;
  sessionId: string | null;
  markedIssueCount: number;
  pendingMarkedIssue: boolean;
  screenRecordingActive: boolean;
}

export interface ElectronTestAPI {
  getConfig(): Promise<ElectronTestConfig>;
  injectInput(sample: ElectronTestInputSample): Promise<{ success: boolean; error?: string }>;
  setInputAvailable(available: boolean, error?: string): Promise<{ success: boolean }>;
  injectTranscript(text: string, recordedAt?: number): Promise<{ success: boolean; error?: string }>;
  getDiagnostics(): Promise<ElectronTestDiagnostics>;
}
